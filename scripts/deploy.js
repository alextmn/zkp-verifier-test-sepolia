async function main() {
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log("Verifier deployed to:", verifier.address);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Verifier deployed to: 0x74B5C544917d4603AE983a25A1dA0b8712d3AF1E