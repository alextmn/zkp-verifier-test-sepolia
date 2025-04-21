const { ethers } = require("hardhat");
const fs = require("fs");


async function main() {
  const proof = JSON.parse(fs.readFileSync("proof-ecdsa.json"));
  const pubSignals = JSON.parse(fs.readFileSync("public-ecdsa.json"));

  const verifier = await ethers.getContractAt("ECDSAGroth16Verifier", "0xb3d83BA5A3b6f78F7DE1C86Df63dd66F23e5b26f");

  function decimalToHexString(decimalStr) {
    return '0x' + BigInt(decimalStr).toString(16);
  }

  const calldata = [
    // a
    [decimalToHexString(proof.pi_a[0]), decimalToHexString(proof.pi_a[1])],

    // b
    [
      [decimalToHexString(proof.pi_b[0][1]), decimalToHexString(proof.pi_b[0][0])],
      [decimalToHexString(proof.pi_b[1][1]), decimalToHexString(proof.pi_b[1][0])],
    ],

    // c
    [decimalToHexString(proof.pi_c[0]), decimalToHexString(proof.pi_c[1])],

    // input signals
    pubSignals.map(decimalToHexString)
  ];
  const tx = await verifier.verifyProof(...calldata);
  await tx.wait();

  console.log("✅ Proof verification transaction confirmed! TX Hash:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
