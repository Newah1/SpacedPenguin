use spaced_penguin_simulator::run_native_sweep_json;
use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::process::ExitCode;

fn print_help() {
    println!(
        "Spaced Penguin native headless simulator\n\n\
Usage:\n\
  spaced-penguin-headless [--request <prepared-request.json>] [--output <result.json>]\n\
  spaced-penguin-headless < prepared-request.json\n\n\
For authored level JSON, use the supported facade:\n\
  node testing/levelTester.js --backend native --level levels/level10.json --samples 10000\n\n\
The facade validates and normalizes the level and compiles candidate-independent world motion;\n\
this executable performs the complete trajectory sweep in optimized native Rust."
    );
}

fn option_value(args: &[String], name: &str) -> Result<Option<String>, String> {
    let Some(index) = args.iter().position(|argument| argument == name) else {
        return Ok(None);
    };
    args.get(index + 1)
        .cloned()
        .map(Some)
        .ok_or_else(|| format!("{name} requires a path"))
}

fn run(args: &[String]) -> Result<(), String> {
    if args
        .iter()
        .any(|argument| argument == "--help" || argument == "-h")
    {
        print_help();
        return Ok(());
    }
    let request_path = option_value(args, "--request")?;
    let output_path = option_value(args, "--output")?;
    let request = if let Some(path) = request_path {
        fs::read(&path).map_err(|error| format!("failed to read {path}: {error}"))?
    } else {
        let mut bytes = Vec::new();
        io::stdin()
            .read_to_end(&mut bytes)
            .map_err(|error| format!("failed to read stdin: {error}"))?;
        bytes
    };
    let response = run_native_sweep_json(&request)?;
    if let Some(path) = output_path {
        fs::write(&path, response).map_err(|error| format!("failed to write {path}: {error}"))?;
    } else {
        io::stdout()
            .write_all(&response)
            .map_err(|error| format!("failed to write stdout: {error}"))?;
    }
    Ok(())
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("spaced-penguin-headless: {error}");
            ExitCode::FAILURE
        }
    }
}
