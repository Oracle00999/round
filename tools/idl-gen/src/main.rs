use anchor_lang_idl::build::IdlBuilder;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Cargo injects RUSTUP_TOOLCHAIN. anchor-lang-idl 0.1.4 incorrectly passes
    // it as the literal "+{toolchain}"; use the already-selected default toolchain.
    std::env::remove_var("RUSTUP_TOOLCHAIN");
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize()?;
    let idl = IdlBuilder::new().program_path(root.join("programs/round")).build()?;
    let output = root.join("src/chain/round.json");
    std::fs::create_dir_all(output.parent().unwrap())?;
    std::fs::write(&output, serde_json::to_string_pretty(&idl)? + "\n")?;
    println!("Generated {}", output.display());
    Ok(())
}
