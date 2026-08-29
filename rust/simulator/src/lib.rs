use std::cell::RefCell;

#[path = "../../../generated/rust/game_objects.rs"]
mod generated_game_objects;
#[path = "../../../generated/rust/simulation_events.rs"]
mod generated_simulation_events;
#[path = "../../../generated/rust/simulation_output.rs"]
mod generated_simulation_output;
#[path = "../../../generated/rust/simulation_output_wire.rs"]
mod generated_simulation_output_wire;
#[path = "../../../generated/rust/simulation_state.rs"]
mod generated_simulation_state;
#[path = "../../../generated/rust/simulation_wire.rs"]
mod generated_simulation_wire;

use generated_game_objects::*;
use generated_simulation_events::SimulationEvent;
use generated_simulation_output::*;
use generated_simulation_state::*;

#[cfg(not(target_arch = "wasm32"))]
mod native_headless;

#[cfg(not(target_arch = "wasm32"))]
pub use native_headless::run_native_sweep_json;

const EPSILON: f64 = f64::EPSILON;

#[derive(Clone, Debug)]
struct Simulator {
    initial: InitialState,
    config: SimulationConfig,
    timeline: Vec<f64>,
    max_steps: usize,
    entity_count: usize,
    time_step: f64,
}

#[derive(Clone, Debug)]
struct CandidateState {
    position: Point,
    velocity: Point,
    planets: Vec<Planet>,
    bonuses: Vec<Bonus>,
    portals: Vec<Portal>,
    speed_boosters: Vec<SpeedBooster>,
    target: Target,
    distance: f64,
    portal_lock_id: Option<String>,
    speed_booster_lock_id: Option<String>,
}

#[derive(Debug)]
enum CandidateTerminal {
    PlanetCollision,
    TargetHit,
    TargetBlocked,
    OutOfBounds,
}

struct CandidateStep {
    events: Vec<SimulationEvent>,
    terminal: Option<CandidateTerminal>,
}

#[derive(Debug)]
struct RuntimeState {
    input: WasmInput,
}

thread_local! {
    static SIMULATORS: RefCell<Vec<Option<Simulator>>> = const { RefCell::new(Vec::new()) };
    static RUNTIME_STATES: RefCell<Vec<Option<RuntimeState>>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static LAST_ERROR: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(length: usize) -> *mut u8 {
    let mut bytes = Vec::<u8>::with_capacity(length);
    let pointer = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    pointer
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, capacity: usize) {
    if !pointer.is_null() && capacity > 0 {
        unsafe {
            drop(Vec::from_raw_parts(pointer, 0, capacity));
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc_f64(length: usize) -> *mut f64 {
    let mut values = Vec::<f64>::with_capacity(length);
    let pointer = values.as_mut_ptr();
    std::mem::forget(values);
    pointer
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc_f64(pointer: *mut f64, capacity: usize) {
    if !pointer.is_null() {
        unsafe {
            drop(Vec::from_raw_parts(pointer, 0, capacity));
        }
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn create_simulator(
    state_pointer: *const u8,
    state_length: usize,
    timeline_pointer: *const f64,
    timeline_length: usize,
    max_steps: usize,
    entity_count: usize,
    time_step: f64,
) -> i32 {
    clear_error();
    let state_bytes = unsafe { std::slice::from_raw_parts(state_pointer, state_length) };
    let timeline = unsafe { std::slice::from_raw_parts(timeline_pointer, timeline_length) };
    let input = match serde_json::from_slice::<WasmInput>(state_bytes) {
        Ok(input) => input,
        Err(error) => return fail(format!("invalid simulation state: {error}")),
    };
    let initial = input.state;
    let expected = match max_steps
        .checked_mul(entity_count)
        .and_then(|value| value.checked_mul(2))
    {
        Some(value) => value,
        None => return fail("timeline dimensions overflow".to_owned()),
    };
    if timeline_length != expected {
        return fail(format!(
            "timeline length {timeline_length} does not match expected {expected}"
        ));
    }

    SIMULATORS.with(|storage| {
        let mut storage = storage.borrow_mut();
        let simulator = Simulator {
            initial,
            config: input.simulation,
            timeline: timeline.to_vec(),
            max_steps,
            entity_count,
            time_step,
        };
        if let Some((index, slot)) = storage
            .iter_mut()
            .enumerate()
            .find(|(_, slot)| slot.is_none())
        {
            *slot = Some(simulator);
            index as i32
        } else {
            storage.push(Some(simulator));
            (storage.len() - 1) as i32
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn destroy_simulator(handle: i32) {
    if handle < 0 {
        return;
    }
    SIMULATORS.with(|storage| {
        if let Some(slot) = storage.borrow_mut().get_mut(handle as usize) {
            *slot = None;
        }
    });
}

/// Create a persistent browser runtime. The initial state/configuration is decoded once;
/// subsequent frames only synchronize moving positions and run the transition kernel.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn create_runtime_state(
    input_pointer: *const u8,
    input_length: usize,
) -> i32 {
    clear_error();
    let input_bytes = unsafe { std::slice::from_raw_parts(input_pointer, input_length) };
    let input = match generated_simulation_wire::decode_step_input(input_bytes) {
        Ok(input) => input,
        Err(error) => return fail(format!("invalid runtime state: {error}")),
    };
    RUNTIME_STATES.with(|storage| {
        let mut storage = storage.borrow_mut();
        let runtime = RuntimeState { input };
        if let Some((index, slot)) = storage
            .iter_mut()
            .enumerate()
            .find(|(_, slot)| slot.is_none())
        {
            *slot = Some(runtime);
            index as i32
        } else {
            storage.push(Some(runtime));
            (storage.len() - 1) as i32
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn destroy_runtime_state(handle: i32) {
    if handle < 0 {
        return;
    }
    RUNTIME_STATES.with(|storage| {
        if let Some(slot) = storage.borrow_mut().get_mut(handle as usize) {
            *slot = None;
        }
    });
}

/// Synchronize candidate-independent world positions in wire order:
/// planets, bonuses, portals, speed boosters, then target.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sync_runtime_world(
    handle: i32,
    positions_pointer: *const f64,
    position_count: usize,
) -> i32 {
    clear_error();
    let positions =
        unsafe { std::slice::from_raw_parts(positions_pointer, position_count.saturating_mul(2)) };
    let result = RUNTIME_STATES.with(|storage| {
        let mut storage = storage.borrow_mut();
        let Some(runtime) = storage
            .get_mut(handle.max(0) as usize)
            .and_then(Option::as_mut)
        else {
            return Err(format!("unknown runtime handle {handle}"));
        };
        let expected = runtime.input.state.planets.len()
            + runtime.input.state.bonuses.len()
            + runtime.input.state.portals.len()
            + runtime.input.state.speed_boosters.len()
            + 1;
        if position_count != expected {
            return Err(format!(
                "world position count {position_count} does not match expected {expected}"
            ));
        }
        let mut entity = 0;
        for object in &mut runtime.input.state.planets {
            object.position = Point {
                x: positions[entity * 2],
                y: positions[entity * 2 + 1],
            };
            entity += 1;
        }
        for object in &mut runtime.input.state.bonuses {
            object.position = Point {
                x: positions[entity * 2],
                y: positions[entity * 2 + 1],
            };
            entity += 1;
        }
        for object in &mut runtime.input.state.portals {
            object.position = Point {
                x: positions[entity * 2],
                y: positions[entity * 2 + 1],
            };
            entity += 1;
        }
        for object in &mut runtime.input.state.speed_boosters {
            object.position = Point {
                x: positions[entity * 2],
                y: positions[entity * 2 + 1],
            };
            entity += 1;
        }
        runtime.input.state.target.position = Point {
            x: positions[entity * 2],
            y: positions[entity * 2 + 1],
        };
        Ok(())
    });
    result.map_or_else(fail, |_| 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn step_runtime_state(handle: i32, delta_time: f64, increment_tick: i32) -> i32 {
    clear_error();
    let result = RUNTIME_STATES.with(|storage| {
        let mut storage = storage.borrow_mut();
        let Some(runtime) = storage
            .get_mut(handle.max(0) as usize)
            .and_then(Option::as_mut)
        else {
            return Err(format!("unknown runtime handle {handle}"));
        };
        let events = step_runtime_state_inner(
            &mut runtime.input.state,
            &runtime.input.simulation,
            delta_time.max(0.0),
        );
        if increment_tick != 0 {
            runtime.input.state.run_tick += 1;
        }
        Ok(make_step_patch(&runtime.input.state, events))
    });
    match result.and_then(|patch| generated_simulation_output_wire::encode_step_patch(&patch)) {
        Ok(bytes) => {
            OUTPUT.with(|output| *output.borrow_mut() = bytes);
            0
        }
        Err(error) => fail(error),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn simulate_batch(
    handle: i32,
    candidate_pointer: *const f64,
    candidate_count: usize,
    requested_max_steps: usize,
    capture_stride: usize,
) -> i32 {
    clear_error();
    let candidate_values =
        unsafe { std::slice::from_raw_parts(candidate_pointer, candidate_count.saturating_mul(2)) };
    let result = SIMULATORS.with(|storage| {
        let storage = storage.borrow();
        let Some(simulator) = storage.get(handle.max(0) as usize).and_then(Option::as_ref) else {
            return Err(format!("unknown simulator handle {handle}"));
        };
        if requested_max_steps > simulator.max_steps {
            return Err(format!(
                "requested {requested_max_steps} steps but timeline contains {}",
                simulator.max_steps
            ));
        }
        Ok(candidate_values
            .chunks_exact(2)
            .map(|candidate| {
                simulator.simulate(
                    candidate[0],
                    candidate[1],
                    requested_max_steps,
                    capture_stride,
                )
            })
            .collect::<Vec<_>>())
    });

    match result.and_then(|results| serde_json::to_vec(&results).map_err(|error| error.to_string()))
    {
        Ok(bytes) => {
            OUTPUT.with(|output| *output.borrow_mut() = bytes);
            0
        }
        Err(error) => fail(error),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn step_state(
    input_pointer: *const u8,
    input_length: usize,
    delta_time: f64,
    increment_tick: i32,
) -> i32 {
    clear_error();
    let input_bytes = unsafe { std::slice::from_raw_parts(input_pointer, input_length) };
    let input = match serde_json::from_slice::<WasmInput>(input_bytes) {
        Ok(input) => input,
        Err(error) => return fail(format!("invalid step state: {error}")),
    };
    execute_step(input, delta_time, increment_tick)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn step_state_binary(
    input_pointer: *const u8,
    input_length: usize,
    delta_time: f64,
    increment_tick: i32,
) -> i32 {
    clear_error();
    let input_bytes = unsafe { std::slice::from_raw_parts(input_pointer, input_length) };
    let input = match generated_simulation_wire::decode_step_input(input_bytes) {
        Ok(input) => input,
        Err(error) => return fail(format!("invalid binary step state: {error}")),
    };
    execute_step(input, delta_time, increment_tick)
}

fn execute_step(mut input: WasmInput, delta_time: f64, increment_tick: i32) -> i32 {
    let events = step_runtime_state_inner(&mut input.state, &input.simulation, delta_time.max(0.0));
    if increment_tick != 0 {
        input.state.run_tick += 1;
    }
    let patch = make_step_patch(&input.state, events);
    match generated_simulation_output_wire::encode_step_patch(&patch) {
        Ok(bytes) => {
            OUTPUT.with(|output| *output.borrow_mut() = bytes);
            0
        }
        Err(error) => fail(error.to_string()),
    }
}

fn make_step_patch(state: &InitialState, events: Vec<SimulationEvent>) -> StepPatch {
    StepPatch {
        time: state.time,
        run_tick: state.run_tick,
        penguin: PenguinPatch {
            position: state.penguin.position,
            velocity: state.penguin.velocity,
            state: state.penguin.state.clone(),
            crash_frames_remaining: state.penguin.crash_frames_remaining,
            portal_lock_id: state.penguin.portal_lock_id.clone(),
            speed_booster_lock_id: state.penguin.speed_booster_lock_id.clone(),
        },
        counters: CounterPatch {
            planet_collisions: state.counters.planet_collisions,
            current_attempt_score: state.counters.current_attempt_score,
            distance: state.counters.distance,
        },
        bonus_collected: state.bonuses.iter().map(|bonus| bonus.collected).collect(),
        events,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn output_pointer() -> *const u8 {
    OUTPUT.with(|output| output.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn output_length() -> usize {
    OUTPUT.with(|output| output.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn error_pointer() -> *const u8 {
    LAST_ERROR.with(|error| error.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn error_length() -> usize {
    LAST_ERROR.with(|error| error.borrow().len())
}

fn clear_error() {
    LAST_ERROR.with(|error| error.borrow_mut().clear());
}

fn fail(message: String) -> i32 {
    LAST_ERROR.with(|error| *error.borrow_mut() = message.into_bytes());
    -1
}

/// The single candidate-independent ordering used by browser frames and headless sweeps.
/// World positions must already be synchronized before this function is called.
fn step_candidate(
    state: &mut CandidateState,
    rules: &Rules,
    config: &SimulationConfig,
    penguin_radius: f64,
    flight_bounds: Rect,
    delta_time: f64,
    emit_movement_event: bool,
) -> CandidateStep {
    let mut events = Vec::new();
    if let Some(index) = find_planet_collision(state.position, &state.planets, penguin_radius) {
        let planet = &state.planets[index];
        let (position, velocity) = resolve_planet_bounce(
            state.position,
            state.velocity,
            planet,
            penguin_radius,
            &config.collision,
        );
        state.position = position;
        state.velocity = velocity;
        events.push(SimulationEvent::PlanetCollision {
            planet_id: planet.id.clone(),
            planet_index: index,
            position,
        });
        return CandidateStep {
            events,
            terminal: Some(CandidateTerminal::PlanetCollision),
        };
    }

    let previous = state.position;
    integrate_gravity(
        &mut state.position,
        &mut state.velocity,
        &state.planets,
        rules.gravitational_constant,
        delta_time,
        config.legacy_physics_fps,
    );
    let gravity_position = state.position;
    if let Some(event) = apply_speed_boosters(state, previous, penguin_radius) {
        events.push(event);
    }
    events.extend(apply_portals(state, previous, penguin_radius));
    state.distance += distance(previous, gravity_position);
    if emit_movement_event {
        events.push(SimulationEvent::PenguinMoved {
            from: Some(previous),
            position: state.position,
            distance: distance(previous, gravity_position),
            delta_time,
        });
    }

    for (index, bonus) in state.bonuses.iter_mut().enumerate() {
        if !bonus.collected
            && circles_overlap(state.position, 0.0, bonus.position, bonus.collection_radius)
        {
            bonus.collected = true;
            events.push(SimulationEvent::BonusCollected {
                bonus_id: bonus.id.clone(),
                bonus_index: index,
                value: bonus.value,
                position: bonus.position,
            });
        }
    }

    if circles_overlap(
        state.position,
        0.0,
        state.target.position,
        state.target.collision_radius,
    ) {
        let collected = state.bonuses.iter().filter(|bonus| bonus.collected).count();
        if let Some(required) = rules
            .required_bonuses
            .filter(|required| collected < *required)
        {
            events.push(SimulationEvent::TargetBlocked {
                rule: "requiredBonuses".to_owned(),
                required,
                collected,
                remaining: required - collected,
                reason: format!("Collect {} more bonuses!", required - collected),
                position: state.position,
            });
            return CandidateStep {
                events,
                terminal: Some(CandidateTerminal::TargetBlocked),
            };
        }
        events.push(SimulationEvent::TargetHit {
            position: state.position,
        });
        return CandidateStep {
            events,
            terminal: Some(CandidateTerminal::TargetHit),
        };
    }

    if !point_in_rect(state.position, flight_bounds) {
        events.push(SimulationEvent::OutOfBounds {
            position: state.position,
        });
        return CandidateStep {
            events,
            terminal: Some(CandidateTerminal::OutOfBounds),
        };
    }
    CandidateStep {
        events,
        terminal: None,
    }
}

impl Simulator {
    fn simulate(
        &self,
        angle: f64,
        power: f64,
        max_steps: usize,
        capture_stride: usize,
    ) -> TrajectoryResult {
        let capture_trajectory = capture_stride > 0;
        let capture_stride = capture_stride.max(1);
        let mut state = CandidateState {
            position: launch_position(angle, power, &self.initial.slingshot),
            velocity: launch_velocity(
                angle,
                power,
                &self.initial.slingshot,
                &self.config.launch_curve,
            ),
            planets: self.initial.planets.clone(),
            bonuses: self.initial.bonuses.clone(),
            portals: self.initial.portals.clone(),
            speed_boosters: self.initial.speed_boosters.clone(),
            target: self.initial.target.clone(),
            distance: 0.0,
            portal_lock_id: None,
            speed_booster_lock_id: None,
        };
        let mut result = TrajectoryResult {
            success: false,
            reason: "timeout".to_owned(),
            steps: 0,
            final_position: state.position,
            trajectory: if capture_trajectory {
                Vec::with_capacity(max_steps / capture_stride + 1)
            } else {
                Vec::new()
            },
            distance: 0.0,
            collected_bonuses: Vec::new(),
            total_bonuses: state.bonuses.len(),
            required_bonuses: self.initial.rules.required_bonuses,
            bonus_score: 0.0,
            events: Vec::new(),
            target_distance: 0.0,
        };

        for step in 0..max_steps {
            if capture_trajectory && step % capture_stride == 0 {
                result.trajectory.push(TrajectoryPoint {
                    x: state.position.x,
                    y: state.position.y,
                    velocity: state.velocity,
                    time: step as f64 * self.time_step,
                });
            }
            self.apply_frame(&mut state, step);
            result.steps = step + 1;

            let step_result = step_candidate(
                &mut state,
                &self.initial.rules,
                &self.config,
                self.initial.penguin.radius,
                self.initial.bounds.flight,
                self.time_step,
                false,
            );
            for event in &step_result.events {
                if let SimulationEvent::BonusCollected {
                    bonus_id, value, ..
                } = event
                {
                    result.collected_bonuses.push(bonus_id.clone());
                    result.bonus_score += *value;
                }
            }
            result.events.extend(step_result.events);
            if let Some(terminal) = step_result.terminal {
                result.reason = match terminal {
                    CandidateTerminal::PlanetCollision => "planet_collision",
                    CandidateTerminal::TargetHit => {
                        result.success = true;
                        "target_hit"
                    }
                    CandidateTerminal::TargetBlocked => "target_blocked",
                    CandidateTerminal::OutOfBounds => "out_of_bounds",
                }
                .to_owned();
                result.final_position = state.position;
                break;
            }
            result.final_position = state.position;
        }

        result.distance = state.distance;
        result.final_position = state.position;
        result.target_distance = distance(state.position, state.target.position);
        result
    }

    fn apply_frame(&self, state: &mut CandidateState, step: usize) {
        let frame = step * self.entity_count * 2;
        let mut entity = 0;
        for planet in &mut state.planets {
            planet.position = self.timeline_point(frame, entity);
            entity += 1;
        }
        for bonus in &mut state.bonuses {
            bonus.position = self.timeline_point(frame, entity);
            entity += 1;
        }
        for portal in &mut state.portals {
            portal.position = self.timeline_point(frame, entity);
            entity += 1;
        }
        for booster in &mut state.speed_boosters {
            booster.position = self.timeline_point(frame, entity);
            entity += 1;
        }
        entity += self.initial.decorations.len();
        state.target.position = self.timeline_point(frame, entity);
    }

    fn timeline_point(&self, frame: usize, entity: usize) -> Point {
        let offset = frame + entity * 2;
        Point {
            x: self.timeline[offset],
            y: self.timeline[offset + 1],
        }
    }
}

fn step_runtime_state_inner(
    state: &mut InitialState,
    config: &SimulationConfig,
    delta_time: f64,
) -> Vec<SimulationEvent> {
    state.time += delta_time;
    let mut events = Vec::new();

    if state.penguin.state == "soaring" {
        let mut candidate = CandidateState {
            position: state.penguin.position,
            velocity: state.penguin.velocity,
            planets: state.planets.clone(),
            bonuses: state.bonuses.clone(),
            portals: state.portals.clone(),
            speed_boosters: state.speed_boosters.clone(),
            target: state.target.clone(),
            distance: state.counters.distance,
            portal_lock_id: state.penguin.portal_lock_id.clone(),
            speed_booster_lock_id: state.penguin.speed_booster_lock_id.clone(),
        };
        let step_result = step_candidate(
            &mut candidate,
            &state.rules,
            config,
            state.penguin.radius,
            state.bounds.flight,
            delta_time,
            true,
        );
        state.penguin.position = candidate.position;
        state.penguin.velocity = candidate.velocity;
        state.penguin.portal_lock_id = candidate.portal_lock_id;
        state.penguin.speed_booster_lock_id = candidate.speed_booster_lock_id;
        state.counters.distance = candidate.distance;
        for (index, bonus) in candidate.bonuses.iter().enumerate() {
            if bonus.collected && !state.bonuses[index].collected {
                state.bonuses[index].collected = true;
                state.counters.current_attempt_score += bonus.value;
            }
        }
        events.extend(step_result.events);
        if let Some(terminal) = step_result.terminal {
            match terminal {
                CandidateTerminal::PlanetCollision => {
                    state.penguin.state = "crashed".to_owned();
                    state.penguin.crash_frames_remaining = config.collision.planet_crash_frames;
                    state.counters.planet_collisions += 1;
                }
                CandidateTerminal::TargetHit => {
                    state.penguin.state = "hitTarget".to_owned();
                    state.penguin.velocity = Point::default();
                }
                CandidateTerminal::TargetBlocked | CandidateTerminal::OutOfBounds => {
                    state.penguin.state = "crashed".to_owned();
                    state.penguin.crash_frames_remaining = config.collision.terminal_crash_frames;
                }
            }
        }
    } else if state.penguin.state == "crashed" {
        state.penguin.crash_frames_remaining -= delta_time * config.legacy_physics_fps;
        if !point_in_rect(state.penguin.position, state.bounds.stage) {
            state.penguin.velocity = Point::default();
        } else {
            state.penguin.position.x += state.penguin.velocity.x * delta_time;
            state.penguin.position.y += state.penguin.velocity.y * delta_time;
            if let Some(index) =
                find_planet_collision(state.penguin.position, &state.planets, state.penguin.radius)
            {
                let planet = &state.planets[index];
                let (position, velocity) = resolve_planet_bounce(
                    state.penguin.position,
                    state.penguin.velocity,
                    planet,
                    state.penguin.radius,
                    &config.collision,
                );
                state.penguin.position = position;
                state.penguin.velocity = velocity;
                events.push(SimulationEvent::PlanetBounce {
                    planet_id: planet.id.clone(),
                    planet_index: index,
                    position,
                });
            }
            events.push(SimulationEvent::PenguinMoved {
                from: None,
                position: state.penguin.position,
                distance: 0.0,
                delta_time,
            });
        }
        if state.penguin.crash_frames_remaining <= 0.0
            || !point_in_rect(state.penguin.position, state.bounds.stage)
        {
            events.push(SimulationEvent::AttemptResetRequired);
        }
    }

    if state.penguin.state != "hitTarget" {
        let failure = if state
            .rules
            .max_tries
            .is_some_and(|maximum| state.counters.tries >= maximum)
        {
            Some(("maxTries", "Maximum attempts reached!"))
        } else if state
            .rules
            .allowed_misses
            .is_some_and(|maximum| state.counters.planet_collisions > maximum)
        {
            Some(("allowedMisses", "Too many planet collisions!"))
        } else {
            None
        };
        if let Some((rule, reason)) = failure {
            if !(rule == "maxTries" && state.penguin.state == "soaring") {
                events.push(SimulationEvent::RuleFailure {
                    rule: rule.to_owned(),
                    reason: reason.to_owned(),
                });
            }
        }
    }
    events
}

fn launch_position(angle_degrees: f64, power: f64, slingshot: &Slingshot) -> Point {
    if slingshot.launch_model != "director" {
        return slingshot.position;
    }
    let pullback = power.clamp(slingshot.min_pullback, slingshot.max_pullback);
    let source_speed = 40.0 * (pullback / slingshot.max_pullback.max(1.0)).powi(2);
    let normalized_distance = 100.0 * pullback / slingshot.max_pullback.max(1.0);
    let snap_frames = (normalized_distance / source_speed.max(EPSILON) + 1.0).trunc();
    let offset = (source_speed * snap_frames - pullback) * slingshot.coordinate_scale;
    let radians = angle_degrees.to_radians();
    Point {
        x: slingshot.anchor_position.x + radians.cos() * offset,
        y: slingshot.anchor_position.y + radians.sin() * offset,
    }
}

fn launch_velocity(
    angle_degrees: f64,
    power: f64,
    slingshot: &Slingshot,
    curve: &LaunchCurve,
) -> Point {
    let radians = angle_degrees.to_radians();
    let speed = if slingshot.launch_model == "director" {
        let pullback = power.clamp(0.0, slingshot.max_pullback);
        let source_speed = 40.0 * (pullback / slingshot.max_pullback.max(1.0)).powi(2);
        source_speed * slingshot.coordinate_scale * slingshot.source_frame_rate.unwrap_or(30.0)
    } else {
        let pullback = power.clamp(0.0, slingshot.max_pullback);
        let knee = slingshot.min_pullback.clamp(0.0, slingshot.max_pullback);
        let factor = if knee > 0.0 && pullback <= knee {
            curve.minimum_speed_factor * pullback / knee
        } else {
            let normalized =
                ((pullback - knee) / (slingshot.max_pullback - knee).max(1.0)).clamp(0.0, 1.0);
            if knee > 0.0 {
                curve.minimum_speed_factor
                    + (curve.maximum_speed_factor - curve.minimum_speed_factor)
                        * normalized.powf(curve.response_exponent)
            } else {
                curve.maximum_speed_factor * normalized.powf(curve.response_exponent)
            }
        };
        factor * slingshot.velocity_multiplier
    };
    Point {
        x: radians.cos() * speed,
        y: radians.sin() * speed,
    }
}

fn integrate_gravity(
    position: &mut Point,
    velocity: &mut Point,
    planets: &[Planet],
    constant: f64,
    dt: f64,
    legacy_fps: f64,
) {
    for planet in planets {
        let dx = planet.position.x - position.x;
        let dy = planet.position.y - position.y;
        let squared = dx * dx + dy * dy;
        if squared <= 0.0 {
            continue;
        }
        let separation = squared.sqrt();
        if separation >= planet.gravitational_reach {
            continue;
        }
        let force = planet.mass * constant / squared;
        velocity.x += force * dx * dt * legacy_fps;
        velocity.y += force * dy * dt * legacy_fps;
    }
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
}

fn find_planet_collision(position: Point, planets: &[Planet], radius: f64) -> Option<usize> {
    planets.iter().position(|planet| {
        planet.collidable
            && planet.collision_radius > 0.0
            && circles_overlap(position, radius, planet.position, planet.collision_radius)
    })
}

fn resolve_planet_bounce(
    position: Point,
    velocity: Point,
    planet: &Planet,
    penguin_radius: f64,
    collision: &CollisionConfig,
) -> (Point, Point) {
    let mut nx = position.x - planet.position.x;
    let mut ny = position.y - planet.position.y;
    let mut length = nx.hypot(ny);
    if length == 0.0 {
        nx = if velocity.x == 0.0 && velocity.y == 0.0 {
            1.0
        } else {
            -velocity.x
        };
        ny = if velocity.x == 0.0 && velocity.y == 0.0 {
            0.0
        } else {
            -velocity.y
        };
        length = nx.hypot(ny).max(1.0);
    }
    nx /= length;
    ny /= length;
    let dot = velocity.x * nx + velocity.y * ny;
    let mut bounced = Point {
        x: (velocity.x - 2.0 * dot * nx) * collision.restitution,
        y: (velocity.y - 2.0 * dot * ny) * collision.restitution,
    };
    if bounced.x.hypot(bounced.y) < collision.minimum_bounce_speed {
        bounced = Point {
            x: nx * collision.minimum_bounce_speed,
            y: ny * collision.minimum_bounce_speed,
        };
    }
    let safe = planet.collision_radius + penguin_radius + collision.separation_padding;
    let separation = length.max(safe);
    (
        Point {
            x: planet.position.x + nx * separation,
            y: planet.position.y + ny * separation,
        },
        bounced,
    )
}

fn distance(a: Point, b: Point) -> f64 {
    (b.x - a.x).hypot(b.y - a.y)
}

fn circles_overlap(a: Point, ar: f64, b: Point, br: f64) -> bool {
    let radius = ar + br;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    dx * dx + dy * dy < radius * radius
}

fn point_in_rect(point: Point, rect: Rect) -> bool {
    point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height
}

fn to_local(point: Point, position: Point, rotation: f64) -> Point {
    let radians = -rotation.to_radians();
    let dx = point.x - position.x;
    let dy = point.y - position.y;
    Point {
        x: dx * radians.cos() - dy * radians.sin(),
        y: dx * radians.sin() + dy * radians.cos(),
    }
}

fn inside_booster(point: Point, booster: &SpeedBooster, padding: f64) -> bool {
    let local = to_local(point, booster.position, booster.rotation);
    local.x.abs() <= booster.width / 2.0 + padding
        && local.y.abs() <= booster.height / 2.0 + padding
}

fn segment_booster_entry(
    start: Point,
    end: Point,
    booster: &SpeedBooster,
    padding: f64,
) -> Option<f64> {
    if inside_booster(start, booster, padding) {
        return None;
    }
    let a = to_local(start, booster.position, booster.rotation);
    let b = to_local(end, booster.position, booster.rotation);
    let delta = Point {
        x: b.x - a.x,
        y: b.y - a.y,
    };
    let mut enter: f64 = 0.0;
    let mut exit: f64 = 1.0;
    for (origin, change, min, max) in [
        (
            a.x,
            delta.x,
            -booster.width / 2.0 - padding,
            booster.width / 2.0 + padding,
        ),
        (
            a.y,
            delta.y,
            -booster.height / 2.0 - padding,
            booster.height / 2.0 + padding,
        ),
    ] {
        if change.abs() < EPSILON {
            if origin < min || origin > max {
                return None;
            }
        } else {
            let first = (min - origin) / change;
            let second = (max - origin) / change;
            enter = enter.max(first.min(second));
            exit = exit.min(first.max(second));
            if enter > exit {
                return None;
            }
        }
    }
    (0.0..=1.0).contains(&enter).then_some(enter)
}

fn apply_speed_boosters(
    state: &mut CandidateState,
    start: Point,
    radius: f64,
) -> Option<SimulationEvent> {
    if let Some(locked) = state
        .speed_boosters
        .iter()
        .find(|booster| Some(&booster.id) == state.speed_booster_lock_id.as_ref())
    {
        if !inside_booster(start, locked, radius + 1.0) {
            state.speed_booster_lock_id = None;
        }
    }
    let hit = state
        .speed_boosters
        .iter()
        .enumerate()
        .filter(|(_, booster)| Some(&booster.id) != state.speed_booster_lock_id.as_ref())
        .filter_map(|(index, booster)| {
            segment_booster_entry(start, state.position, booster, radius)
                .map(|fraction| (index, fraction))
        })
        .min_by(|left, right| left.1.total_cmp(&right.1));
    let Some((index, fraction)) = hit else {
        return None;
    };
    let booster = &state.speed_boosters[index];
    let incoming_velocity = state.velocity;
    let speed = state.velocity.x.hypot(state.velocity.y) * booster.speed_multiplier;
    let angle = booster.rotation.to_radians();
    state.velocity = Point {
        x: angle.cos() * speed,
        y: angle.sin() * speed,
    };
    state.speed_booster_lock_id = Some(booster.id.clone());
    Some(SimulationEvent::SpeedBoosterActivated {
        speed_booster_id: booster.id.clone(),
        speed_booster_index: index,
        position: Point {
            x: start.x + (state.position.x - start.x) * fraction,
            y: start.y + (state.position.y - start.y) * fraction,
        },
        incoming_velocity,
        velocity: state.velocity,
        play_sound: booster.play_sound,
    })
}

fn inside_portal(point: Point, portal: &Portal, padding: f64) -> bool {
    let local = to_local(point, portal.position, portal.rotation);
    let rx = portal.width / 2.0 + padding;
    let ry = portal.height / 2.0 + padding;
    local.x * local.x / (rx * rx) + local.y * local.y / (ry * ry) <= 1.0
}

fn segment_portal_entry(start: Point, end: Point, portal: &Portal, padding: f64) -> Option<f64> {
    if inside_portal(start, portal, padding) {
        return None;
    }
    let a = to_local(start, portal.position, portal.rotation);
    let b = to_local(end, portal.position, portal.rotation);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let angle = portal.rotation.to_radians();
    let outward = Point {
        x: angle.sin(),
        y: -angle.cos(),
    };
    if (end.x - start.x) * outward.x + (end.y - start.y) * outward.y >= -EPSILON {
        return None;
    }
    let rx = portal.width / 2.0 + padding;
    let ry = portal.height / 2.0 + padding;
    let qa = dx * dx / (rx * rx) + dy * dy / (ry * ry);
    if qa <= EPSILON {
        return None;
    }
    let qb = 2.0 * (a.x * dx / (rx * rx) + a.y * dy / (ry * ry));
    let qc = a.x * a.x / (rx * rx) + a.y * a.y / (ry * ry) - 1.0;
    let discriminant = qb * qb - 4.0 * qa * qc;
    if discriminant < 0.0 {
        return None;
    }
    let root = discriminant.sqrt();
    [(-qb - root) / (2.0 * qa), (-qb + root) / (2.0 * qa)]
        .into_iter()
        .filter(|value| (0.0..=1.0).contains(value) && a.y + dy * value <= EPSILON)
        .min_by(f64::total_cmp)
}

fn rotate(vector: Point, radians: f64) -> Point {
    Point {
        x: vector.x * radians.cos() - vector.y * radians.sin(),
        y: vector.x * radians.sin() + vector.y * radians.cos(),
    }
}

fn apply_portals(
    state: &mut CandidateState,
    original_start: Point,
    radius: f64,
) -> Vec<SimulationEvent> {
    let mut events = Vec::new();
    if state.portals.len() < 2 {
        return events;
    }
    if let Some(locked) = state
        .portals
        .iter()
        .find(|portal| Some(&portal.id) == state.portal_lock_id.as_ref())
    {
        if !inside_portal(original_start, locked, radius + 1.0) {
            state.portal_lock_id = None;
        }
    }
    let mut start = original_start;
    let mut end = state.position;
    for _ in 0..4 {
        let hit = state
            .portals
            .iter()
            .enumerate()
            .filter(|(_, portal)| Some(&portal.id) != state.portal_lock_id.as_ref())
            .filter_map(|(index, portal)| {
                let pair = state.portals.iter().position(|candidate| {
                    Some(&candidate.id) == portal.paired_portal_id.as_ref()
                })?;
                segment_portal_entry(start, end, portal, radius)
                    .map(|fraction| (index, pair, fraction))
            })
            .min_by(|left, right| left.2.total_cmp(&right.2));
        let Some((source_index, pair_index, fraction)) = hit else {
            break;
        };
        let source = &state.portals[source_index];
        let pair = &state.portals[pair_index];
        let impact = Point {
            x: start.x + (end.x - start.x) * fraction,
            y: start.y + (end.y - start.y) * fraction,
        };
        let turn = (pair.rotation - source.rotation + 180.0).to_radians();
        let remaining = rotate(
            Point {
                x: end.x - impact.x,
                y: end.y - impact.y,
            },
            turn,
        );
        let incoming_velocity = state.velocity;
        state.velocity = rotate(state.velocity, turn);
        let speed = state.velocity.x.hypot(state.velocity.y);
        let direction = if speed > EPSILON {
            Point {
                x: state.velocity.x / speed,
                y: state.velocity.y / speed,
            }
        } else {
            rotate(Point { x: 1.0, y: 0.0 }, pair.rotation.to_radians())
        };
        let local = rotate(direction, -pair.rotation.to_radians());
        let rx = pair.width / 2.0 + radius + 1.0;
        let ry = pair.height / 2.0 + radius + 1.0;
        let denominator = (local.x * local.x / (rx * rx) + local.y * local.y / (ry * ry)).sqrt();
        let clearance = if denominator > EPSILON {
            1.0 / denominator
        } else {
            rx.max(ry)
        };
        let exit = Point {
            x: pair.position.x + direction.x * clearance,
            y: pair.position.y + direction.y * clearance,
        };
        events.push(SimulationEvent::PortalTeleported {
            source_portal_id: source.id.clone(),
            destination_portal_id: pair.id.clone(),
            entry_position: impact,
            exit_position: exit,
            incoming_velocity,
            velocity: state.velocity,
            play_sound: source.play_sound && pair.play_sound,
        });
        state.portal_lock_id = Some(pair.id.clone());
        start = exit;
        end = Point {
            x: exit.x + remaining.x,
            y: exit.y + remaining.y,
        };
    }
    state.position = end;
    events
}
