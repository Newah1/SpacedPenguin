use super::{Simulator, TrajectoryResult, WasmInput};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCandidate {
    candidate_index: usize,
    angle: f64,
    power: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSweepRequest {
    input: WasmInput,
    timeline: Vec<f64>,
    max_steps: usize,
    entity_count: usize,
    time_step: f64,
    candidates: Vec<NativeCandidate>,
    capture_stride: usize,
    near_miss_limit: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedTrajectoryResult {
    candidate_index: usize,
    angle: f64,
    power: f64,
    #[serde(flatten)]
    outcome: TrajectoryResult,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSweepResponse {
    evaluated_candidates: usize,
    successful: Vec<IndexedTrajectoryResult>,
    near_misses: Vec<IndexedTrajectoryResult>,
}

struct RankedNearMiss {
    request_index: usize,
    candidate_index: usize,
    outcome: TrajectoryResult,
}

fn compare_near_misses(left: &RankedNearMiss, right: &RankedNearMiss) -> Ordering {
    right
        .outcome
        .collected_bonuses
        .len()
        .cmp(&left.outcome.collected_bonuses.len())
        .then_with(|| {
            left.outcome
                .target_distance
                .total_cmp(&right.outcome.target_distance)
        })
        .then_with(|| {
            right
                .outcome
                .bonus_score
                .total_cmp(&left.outcome.bonus_score)
        })
        .then_with(|| right.outcome.distance.total_cmp(&left.outcome.distance))
        .then_with(|| left.candidate_index.cmp(&right.candidate_index))
}

fn detailed_result(
    simulator: &Simulator,
    request: &NativeSweepRequest,
    request_index: usize,
) -> IndexedTrajectoryResult {
    let candidate = &request.candidates[request_index];
    IndexedTrajectoryResult {
        candidate_index: candidate.candidate_index,
        angle: candidate.angle,
        power: candidate.power,
        outcome: simulator.simulate(
            candidate.angle,
            candidate.power,
            request.max_steps,
            request.capture_stride,
        ),
    }
}

fn indexed_result(
    request: &NativeSweepRequest,
    request_index: usize,
    outcome: TrajectoryResult,
) -> IndexedTrajectoryResult {
    let candidate = &request.candidates[request_index];
    IndexedTrajectoryResult {
        candidate_index: candidate.candidate_index,
        angle: candidate.angle,
        power: candidate.power,
        outcome,
    }
}

fn run_native_sweep(request: NativeSweepRequest) -> Result<NativeSweepResponse, String> {
    if !request.time_step.is_finite() || request.time_step <= 0.0 {
        return Err("timeStep must be a positive finite number".to_owned());
    }
    let expected_timeline_length = request
        .max_steps
        .checked_mul(request.entity_count)
        .and_then(|value| value.checked_mul(2))
        .ok_or("timeline dimensions overflow")?;
    if request.timeline.len() != expected_timeline_length {
        return Err(format!(
            "timeline length {} does not match expected {expected_timeline_length}",
            request.timeline.len()
        ));
    }
    if request
        .candidates
        .iter()
        .any(|candidate| !candidate.angle.is_finite() || !candidate.power.is_finite())
    {
        return Err("candidate angles and powers must be finite".to_owned());
    }

    let simulator = Simulator {
        initial: request.input.state.clone(),
        config: request.input.simulation.clone(),
        timeline: request.timeline.clone(),
        max_steps: request.max_steps,
        entity_count: request.entity_count,
        time_step: request.time_step,
    };
    let mut successful_summaries = Vec::new();
    let mut near_misses = Vec::<RankedNearMiss>::with_capacity(request.near_miss_limit);

    for (request_index, candidate) in request.candidates.iter().enumerate() {
        let outcome = simulator.simulate(candidate.angle, candidate.power, request.max_steps, 0);
        if outcome.success {
            successful_summaries.push((request_index, outcome));
        } else if request.near_miss_limit > 0 {
            near_misses.push(RankedNearMiss {
                request_index,
                candidate_index: candidate.candidate_index,
                outcome,
            });
            near_misses.sort_by(compare_near_misses);
            near_misses.truncate(request.near_miss_limit);
        }
    }

    let successful = successful_summaries
        .into_iter()
        .map(|(index, outcome)| {
            if request.capture_stride > 0 {
                detailed_result(&simulator, &request, index)
            } else {
                indexed_result(&request, index, outcome)
            }
        })
        .collect();
    let near_misses = near_misses
        .into_iter()
        .map(|ranked| {
            if request.capture_stride > 0 {
                detailed_result(&simulator, &request, ranked.request_index)
            } else {
                indexed_result(&request, ranked.request_index, ranked.outcome)
            }
        })
        .collect();

    Ok(NativeSweepResponse {
        evaluated_candidates: request.candidates.len(),
        successful,
        near_misses,
    })
}

/// Execute one native headless sweep from the canonical Node-prepared state/timeline envelope.
/// The executable owns candidate simulation and result filtering; authored-level parsing and
/// candidate-independent world compilation remain in the existing shared adapters.
pub fn run_native_sweep_json(request_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let request = serde_json::from_slice::<NativeSweepRequest>(request_bytes)
        .map_err(|error| format!("invalid native sweep request: {error}"))?;
    let response = run_native_sweep(request)?;
    serde_json::to_vec(&response).map_err(|error| error.to_string())
}
