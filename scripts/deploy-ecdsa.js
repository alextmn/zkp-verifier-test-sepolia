async function main() {
  const Verifier = await ethers.getContractFactory("ECDSAGroth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log("ECDSAGroth16Verifier deployed to:", verifier.address);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Verifier deployed to: 0xb3d83BA5A3b6f78F7DE1C86Df63dd66F23e5b26f