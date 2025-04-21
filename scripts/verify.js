const { ethers } = require("hardhat");
const fs = require("fs");


async function main() {
  const proof = JSON.parse(fs.readFileSync("proof.json"));
  const pubSignals = JSON.parse(fs.readFileSync("public.json"));

  const verifier = await ethers.getContractAt("Groth16Verifier", "0xD2d1dBec05e39872Efce0DB80C17f62F95821db7");

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
