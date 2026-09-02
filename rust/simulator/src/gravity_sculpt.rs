use super::{
    CandidateState, CandidateTerminal, InitialState, PenguinState, Point, SculptBatchInput, SculptConfig,
    SculptCandidateOutput, SculptContextInput, SculptLaunch, SculptObjectiveTerms,
    SculptRobustScoreTerms, SculptVariable, SculptWaypointMatch, SimulationEvent, WasmInput,
    clear_error, fail, launch_velocity, step_candidate, OUTPUT,
};
use std::cell::RefCell;

#[derive(Clone, Debug)]
enum VariableTarget {
    PlanetX(usize),
    PlanetY(usize),
    PlanetMass(usize),
    LaunchAngle,
    LaunchPower,
}

#[derive(Clone, Debug)]
struct SculptContext {
    input: WasmInput,
    launch: SculptLaunch,
    variables: Vec<SculptVariable>,
    targets: Vec<VariableTarget>,
}

struct SimulationMetrics {
    trajectory: Vec<Point>,
    terminal: PenguinState,
    constraint_violations: Vec<String>,
    elapsed_seconds: f64,
    path_length: f64,
    direct_distance: f64,
    path_efficiency: f64,
    peak_gravity_acceleration: f64,
    mean_gravity_acceleration: f64,
    physics_comfort_penalty: f64,
    score: f64,
    checkpoint_coverage: f64,
    missed_waypoint_count: usize,
    endpoint_distance: f64,
    waypoint_matches: Vec<SculptWaypointMatch>,
    objective_terms: SculptObjectiveTerms,
}

thread_local! {
    static SCULPT_CONTEXTS: RefCell<Vec<Option<SculptContext>>> = const { RefCell::new(Vec::new()) };
}

fn parse_target(key: &str) -> Result<VariableTarget, String> {
    if key == "launch.angleDegrees" {
        return Ok(VariableTarget::LaunchAngle);
    }
    if key == "launch.pullbackPower" {
        return Ok(VariableTarget::LaunchPower);
    }
    let pieces: Vec<_> = key.split('.').collect();
    if pieces.len() != 3 || pieces[0] != "planet" {
        return Err(format!("unsupported gravity sculpt variable {key}"));
    }
    let index = pieces[1]
        .parse::<usize>()
        .map_err(|_| format!("invalid planet index in gravity sculpt variable {key}"))?;
    match pieces[2] {
        "x" => Ok(VariableTarget::PlanetX(index)),
        "y" => Ok(VariableTarget::PlanetY(index)),
        "mass" => Ok(VariableTarget::PlanetMass(index)),
        _ => Err(format!("unsupported gravity sculpt variable {key}")),
    }
}

fn point_distance(left: Point, right: Point) -> f64 {
    (left.x - right.x).hypot(left.y - right.y)
}

fn search_coordinate(variable: &SculptVariable, value: f64) -> f64 {
    if variable.scale == "log" {
        value.max(f64::MIN_POSITIVE).ln()
    } else {
        value
    }
}

fn search_span(variable: &SculptVariable) -> f64 {
    (search_coordinate(variable, variable.max) - search_coordinate(variable, variable.min))
        .max(f64::EPSILON)
}

fn parameter_penalty(variable: &SculptVariable, config: &SculptConfig) -> f64 {
    match variable.kind.as_str() {
        "launch" => config.launch_penalty,
        "mass" => config.mass_penalty,
        _ => config.movement_penalty,
    }
}

fn direct_distance(path: &[Point], target: Point, config: &SculptConfig) -> f64 {
    let mut total = path.windows(2).map(|pair| point_distance(pair[0], pair[1])).sum::<f64>();
    if config.goals.require_target
        && path.last().is_some_and(|last| point_distance(*last, target) > config.checkpoint_tolerance)
    {
        total += point_distance(*path.last().unwrap(), target);
    }
    total.max(1.0)
}

fn match_waypoints(trajectory: &[Point], waypoints: &[Point], config: &SculptConfig) -> Vec<SculptWaypointMatch> {
    if waypoints.len() <= 1 || trajectory.is_empty() {
        return Vec::new();
    }
    let original_length = trajectory.len();
    let mut samples = trajectory.to_vec();
    while samples.len() < waypoints.len() {
        samples.push(*samples.last().unwrap());
    }
    let targets = &waypoints[1..];
    let mut costs = vec![vec![f64::INFINITY; samples.len()]; targets.len()];
    let mut parents = vec![vec![usize::MAX; samples.len()]; targets.len()];
    let match_cost = |sample: Point, target: Point, virtual_match: bool| {
        let raw = point_distance(sample, target);
        let value = if virtual_match { config.unmatched_waypoint_distance.max(raw) } else { raw };
        value * value + if value > config.checkpoint_tolerance { config.waypoint_constraint_penalty } else { 0.0 }
    };
    for sample_index in 1..samples.len() {
        costs[0][sample_index] = match_cost(samples[sample_index], targets[0], sample_index >= original_length);
    }
    for target_index in 1..targets.len() {
        let mut best_cost = f64::INFINITY;
        let mut best_index = usize::MAX;
        for sample_index in (target_index + 1)..samples.len() {
            let previous = sample_index - 1;
            if costs[target_index - 1][previous] < best_cost {
                best_cost = costs[target_index - 1][previous];
                best_index = previous;
            }
            if best_index != usize::MAX {
                costs[target_index][sample_index] = best_cost
                    + match_cost(samples[sample_index], targets[target_index], sample_index >= original_length);
                parents[target_index][sample_index] = best_index;
            }
        }
    }
    let last = costs.last().unwrap();
    let mut sample_index = last.iter().enumerate()
        .min_by(|left, right| left.1.total_cmp(right.1)).map(|entry| entry.0).unwrap_or(0);
    let mut matches = vec![SculptWaypointMatch {
        index: 0, distance: 0.0, r#virtual: false, point: Point::default()
    }; targets.len()];
    for target_index in (0..targets.len()).rev() {
        let virtual_match = sample_index >= original_length;
        let raw = point_distance(samples[sample_index], targets[target_index]);
        matches[target_index] = SculptWaypointMatch {
            index: sample_index.min(original_length - 1),
            distance: if virtual_match { config.unmatched_waypoint_distance.max(raw) } else { raw },
            r#virtual: virtual_match,
            point: samples[sample_index],
        };
        if target_index > 0 {
            sample_index = parents[target_index][sample_index];
        }
    }
    matches
}

fn apply_values(context: &SculptContext, state: &mut InitialState, values: &[f64]) -> Result<(Point, Option<(f64, f64)>), String> {
    if values.len() != context.targets.len() {
        return Err(format!("gravity sculpt candidate has {} values; expected {}", values.len(), context.targets.len()));
    }
    let mut launch_parameters = None;
    for (target, value) in context.targets.iter().zip(values) {
        if !value.is_finite() {
            return Err("gravity sculpt candidate values must be finite".to_owned());
        }
        match *target {
            VariableTarget::PlanetX(index) => state.planets.get_mut(index).ok_or("gravity sculpt planet index is out of range")?.position.x = *value,
            VariableTarget::PlanetY(index) => state.planets.get_mut(index).ok_or("gravity sculpt planet index is out of range")?.position.y = *value,
            VariableTarget::PlanetMass(index) => state.planets.get_mut(index).ok_or("gravity sculpt planet index is out of range")?.mass = *value,
            VariableTarget::LaunchAngle => launch_parameters.get_or_insert((0.0, 0.0)).0 = *value,
            VariableTarget::LaunchPower => launch_parameters.get_or_insert((0.0, 0.0)).1 = *value,
        }
    }
    let velocity = launch_parameters.map_or(context.launch.velocity, |(angle, power)| {
        launch_velocity(angle, power, &state.slingshot, &context.input.simulation.launch_curve)
    });
    Ok((velocity, launch_parameters))
}

fn simulate_once(
    context: &SculptContext,
    values: &[f64],
    desired_path: &[Point],
    config: &SculptConfig,
    velocity_override: Option<Point>,
    retain_trajectory: bool,
) -> Result<SimulationMetrics, String> {
    let mut initial = context.input.state.clone();
    let (central_velocity, _) = apply_values(context, &mut initial, values)?;
    let mut state = CandidateState {
        position: initial.slingshot.position,
        velocity: velocity_override.unwrap_or(central_velocity),
        planets: initial.planets.clone(),
        bonuses: initial.bonuses.clone(),
        portals: initial.portals.clone(),
        speed_boosters: initial.speed_boosters.clone(),
        deflector_bumpers: initial.deflector_bumpers.clone(),
        target: initial.target.clone(),
        distance: 0.0,
        portal_lock_id: None,
        speed_booster_lock_id: None,
    };
    let direct_distance = direct_distance(desired_path, state.target.position, config);
    let distance_budget = direct_distance * config.trajectory_distance_budget_multiplier;
    let steps = (config.preview_seconds * config.trajectory_time_safety_multiplier / config.time_step).ceil() as usize;
    let mut trajectory = Vec::with_capacity(steps / config.sample_every_steps.max(1) + 2);
    trajectory.push(state.position);
    let mut elapsed_seconds = 0.0;
    let mut path_length = 0.0;
    let mut peak_gravity: f64 = 0.0;
    let mut gravity_total = 0.0;
    let mut gravity_samples = 0usize;
    let mut planet_collision = false;
    let mut out_of_bounds = false;
    let mut terminal = PenguinState::Soaring;
    let mut next_waypoint_index = 1usize;
    for step in 1..=steps {
        let previous_position = state.position;
        let previous_velocity = state.velocity;
        let result = step_candidate(
            &mut state,
            &initial.rules,
            &context.input.simulation,
            initial.penguin.radius,
            initial.bounds.flight,
            config.time_step,
            false,
        );
        elapsed_seconds += config.time_step;
        path_length += point_distance(previous_position, state.position);
        let collided = result.events.iter().any(|event| matches!(event,
            SimulationEvent::PlanetCollision { .. } | SimulationEvent::PlanetBounce { .. }
        ));
        planet_collision |= collided;
        out_of_bounds |= result.events.iter().any(|event| matches!(event, SimulationEvent::OutOfBounds { .. }));
        if !collided && result.terminal.is_none() {
            let acceleration = point_distance(state.velocity, previous_velocity) / config.time_step;
            peak_gravity = peak_gravity.max(acceleration);
            gravity_total += acceleration;
            gravity_samples += 1;
        }
        if step % config.sample_every_steps.max(1) == 0 || result.terminal.is_some() {
            trajectory.push(state.position);
            if next_waypoint_index < desired_path.len()
                && point_distance(state.position, desired_path[next_waypoint_index]) <= config.checkpoint_tolerance
            {
                next_waypoint_index += 1;
            }
        }
        if let Some(value) = result.terminal {
            terminal = match value {
                CandidateTerminal::PlanetCollision => PenguinState::Crashed,
                CandidateTerminal::TargetHit => PenguinState::HitTarget,
                CandidateTerminal::TargetBlocked | CandidateTerminal::OutOfBounds => PenguinState::Crashed,
            };
            break;
        }
        let completion_goals_satisfied = !config.goals.require_target
            && config.goals.required_bonus_indices.iter()
                .all(|index| state.bonuses.get(*index).is_some_and(|bonus| bonus.collected));
        if next_waypoint_index >= desired_path.len() && completion_goals_satisfied {
            break;
        }
        if path_length >= distance_budget {
            break;
        }
    }
    let matches = match_waypoints(&trajectory, desired_path, config);
    let waypoint_count = desired_path.len().saturating_sub(1).max(1);
    let checkpoints = matches.iter().filter(|entry| !entry.r#virtual && entry.distance <= config.checkpoint_tolerance).count();
    let missed = waypoint_count - checkpoints;
    let mut waypoint_score = matches.iter().map(|entry| {
        let excess = (entry.distance - config.checkpoint_tolerance).max(0.0);
        (excess * excess + entry.distance * entry.distance * config.waypoint_proximity_weight) / waypoint_count as f64
    }).sum::<f64>();
    waypoint_score += missed as f64 * config.waypoint_constraint_penalty;
    for (variable, value) in context.variables.iter().zip(values) {
        let normalized = (search_coordinate(variable, *value) - search_coordinate(variable, variable.initial)) / search_span(variable);
        waypoint_score += normalized * normalized * parameter_penalty(variable, config);
    }
    if terminal != PenguinState::HitTarget {
        waypoint_score += config.terminal_penalty;
    }
    let mean_gravity = if gravity_samples == 0 { 0.0 } else { gravity_total / gravity_samples as f64 };
    let path_efficiency = path_length / direct_distance;
    let peak_term = (peak_gravity / config.peak_gravity_acceleration_soft_limit - 1.0).max(0.0).powi(2) * config.peak_gravity_acceleration_weight;
    let mean_term = (mean_gravity / config.mean_gravity_acceleration_soft_limit - 1.0).max(0.0).powi(2) * config.mean_gravity_acceleration_weight;
    let route_term = (path_efficiency - 1.0).max(0.0).powi(2) * config.path_efficiency_weight;
    let mut violations = Vec::new();
    if config.goals.require_target && terminal != PenguinState::HitTarget { violations.push("target".to_owned()); }
    if config.goals.avoid_planet_collisions && planet_collision { violations.push("planet_collision".to_owned()); }
    if config.goals.stay_in_bounds && out_of_bounds { violations.push("out_of_bounds".to_owned()); }
    if config.goals.max_flight_seconds.is_some_and(|maximum| elapsed_seconds > maximum) { violations.push("time_limit".to_owned()); }
    for index in &config.goals.required_bonus_indices {
        if !state.bonuses.get(*index).is_some_and(|bonus| bonus.collected) {
            violations.push(format!("bonus_{index}"));
        }
    }
    let hard_term = violations.len() as f64 * config.hard_constraint_penalty;
    let objective_terms = SculptObjectiveTerms {
        waypoint_fit: waypoint_score,
        hard_constraints: hard_term,
        peak_gravity: peak_term,
        mean_gravity: mean_term,
        route_efficiency: route_term,
    };
    Ok(SimulationMetrics {
        score: waypoint_score + hard_term + peak_term + mean_term + route_term,
        checkpoint_coverage: checkpoints as f64 / waypoint_count as f64,
        missed_waypoint_count: missed,
        endpoint_distance: point_distance(*trajectory.last().unwrap(), *desired_path.last().unwrap()),
        waypoint_matches: matches,
        trajectory: if retain_trajectory { trajectory } else { Vec::new() },
        terminal,
        constraint_violations: violations,
        elapsed_seconds,
        path_length,
        direct_distance,
        path_efficiency,
        peak_gravity_acceleration: peak_gravity,
        mean_gravity_acceleration: mean_gravity,
        physics_comfort_penalty: peak_term + mean_term + route_term,
        objective_terms,
    })
}

fn evaluate_candidate(
    context: &SculptContext,
    values: &[f64],
    path: &[Point],
    config: &SculptConfig,
    capture_trajectory: bool,
) -> Result<SculptCandidateOutput, String> {
    let central = simulate_once(context, values, path, config, None, capture_trajectory)?;
    let mut state = context.input.state.clone();
    let (_, launch_parameters) = apply_values(context, &mut state, values)?;
    let neighbors = if let Some((angle, power)) = launch_parameters {
        config.robust_launch_offsets.iter().map(|offset| {
            let perturbed_power = (power * (1.0 + offset.power_fraction))
                .clamp(state.slingshot.min_pullback, state.slingshot.max_pullback);
            let velocity = launch_velocity(
                angle + offset.angle_degrees,
                perturbed_power,
                &state.slingshot,
                &context.input.simulation.launch_curve,
            );
            simulate_once(context, values, path, config, Some(velocity), false)
        }).collect::<Result<Vec<_>, _>>()?
    } else {
        Vec::new()
    };
    let (score, robust_terms, robust_coverage, robust_goals) = if neighbors.is_empty() {
        (central.score, None, None, None)
    } else {
        let average = neighbors.iter().map(|value| value.score).sum::<f64>() / neighbors.len() as f64;
        let worst = neighbors.iter().map(|value| value.score).fold(f64::NEG_INFINITY, f64::max);
        let terms = SculptRobustScoreTerms {
            central: central.score * config.robust_central_weight,
            average: average * config.robust_average_weight,
            worst: worst * config.robust_worst_weight,
        };
        let coverage = neighbors.iter().fold(central.checkpoint_coverage, |value, item| value.min(item.checkpoint_coverage));
        let goals = std::iter::once(&central).chain(neighbors.iter()).filter(|item| item.constraint_violations.is_empty()).count() as f64 / (neighbors.len() + 1) as f64;
        (terms.central + terms.average + terms.worst, Some(terms), Some(coverage), Some(goals))
    };
    Ok(SculptCandidateOutput {
        score,
        checkpoint_coverage: central.checkpoint_coverage,
        missed_waypoint_count: central.missed_waypoint_count,
        endpoint_distance: central.endpoint_distance,
        waypoint_matches: central.waypoint_matches,
        trajectory: central.trajectory,
        terminal: central.terminal.as_wire().to_owned(),
        values: values.to_vec(),
        constraint_violations: central.constraint_violations,
        elapsed_seconds: central.elapsed_seconds,
        path_length: central.path_length,
        direct_distance: central.direct_distance,
        path_efficiency: central.path_efficiency,
        peak_gravity_acceleration: central.peak_gravity_acceleration,
        mean_gravity_acceleration: central.mean_gravity_acceleration,
        physics_comfort_penalty: central.physics_comfort_penalty,
        objective_terms: central.objective_terms,
        robust_score_terms: robust_terms,
        robust_checkpoint_coverage: robust_coverage,
        robust_goal_success_rate: robust_goals,
        simulation_count: neighbors.len() + 1,
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn create_sculpt_context(pointer: *const u8, length: usize) -> i32 {
    clear_error();
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    let request = match serde_json::from_slice::<SculptContextInput>(bytes) {
        Ok(value) => value,
        Err(error) => return fail(format!("invalid gravity sculpt context: {error}")),
    };
    let targets = match request.variables.iter().map(|value| parse_target(&value.key)).collect::<Result<Vec<_>, _>>() {
        Ok(value) => value,
        Err(error) => return fail(error),
    };
    let context = SculptContext {
        input: WasmInput { state: request.state, simulation: request.simulation },
        launch: request.launch,
        variables: request.variables,
        targets,
    };
    SCULPT_CONTEXTS.with(|storage| {
        let mut storage = storage.borrow_mut();
        if let Some((index, slot)) = storage.iter_mut().enumerate().find(|(_, slot)| slot.is_none()) {
            *slot = Some(context);
            index as i32
        } else {
            storage.push(Some(context));
            (storage.len() - 1) as i32
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn destroy_sculpt_context(handle: i32) {
    if handle < 0 { return; }
    SCULPT_CONTEXTS.with(|storage| {
        if let Some(slot) = storage.borrow_mut().get_mut(handle as usize) { *slot = None; }
    });
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn evaluate_sculpt_batch(handle: i32, pointer: *const u8, length: usize) -> i32 {
    clear_error();
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    let request = match serde_json::from_slice::<SculptBatchInput>(bytes) {
        Ok(value) => value,
        Err(error) => return fail(format!("invalid gravity sculpt batch: {error}")),
    };
    if request.desired_path.len() < 2 || !request.config.time_step.is_finite() || request.config.time_step <= 0.0 {
        return fail("gravity sculpt requires a path and positive time step".to_owned());
    }
    let result = SCULPT_CONTEXTS.with(|storage| {
        let storage = storage.borrow();
        let context = storage.get(handle.max(0) as usize).and_then(Option::as_ref)
            .ok_or_else(|| format!("unknown gravity sculpt context {handle}"))?;
        request.candidates.iter().map(|values| evaluate_candidate(
            context,
            values,
            &request.desired_path,
            &request.config,
            request.capture_trajectories,
        )).collect::<Result<Vec<_>, _>>()
    });
    match result.and_then(|values| serde_json::to_vec(&values).map_err(|error| error.to_string())) {
        Ok(bytes) => { OUTPUT.with(|output| *output.borrow_mut() = bytes); 0 }
        Err(error) => fail(error),
    }
}
