Here’s a complete `README.md` file based on the previous answer:

---

```markdown
# 🚀 Circom ZKP Verifier Contract Deployment to Ethereum Testnet

This project demonstrates how to create, compile, and deploy a Zero-Knowledge Proof (ZKP) Verifier Contract on an Ethereum test network (e.g., Goerli) using Circom and Hardhat.

---

## 📦 Prerequisites

Install required global tools:

```bash
npm install -g circom snarkjs hardhat
```

Initialize your project:

```bash
mkdir zkp-verifier && cd zkp-verifier
npm init -y
npm install @nomiclabs/hardhat-ethers ethers dotenv
```

---

## 🛠️ Step-by-Step Instructions

### 1. ✍️ Create a Circuit

Create `multiplier.circom`:

```circom
pragma circom 2.0.0;

template Multiplier() {
    signal input a;
    signal input b;
    signal output c;

    c <== a * b;
}

component main = Multiplier();
```

Compile:

```bash
circom multiplier.circom --r1cs --wasm --sym

# non-linear constraints: 1508922
# linear constraints: 131701
# public inputs: 8
# private inputs: 12
# public outputs: 1
# wires: 1632054
# labels: 2129808
circome cdsa-verify.circom --r1cs --wasm --sym
```

---

### 2. 🔃 Trusted Setup

Generate `.zkey` files:

```bash
snarkjs groth16 setup multiplier.r1cs powersOfTau28_hez_final_21.ptau multiplier_0000.zkey
snarkjs zkey contribute multiplier_0000.zkey multiplier_final.zkey --name="My contribution" -v

#ECDSA
snarkjs groth16 setup ecdsa-verify.r1cs powersOfTau28_hez_final_21.ptau ecdsa-verify_0000.zkey
snarkjs zkey contribute ecdsa-verify_0000.zkey ecdsa-verify_final.zkey --name="My contribution" -v

```

---

### 3. ⚙️ Set Up Hardhat

Initialize Hardhat:

```bash
npx hardhat
```

Choose "Create a JavaScript project".

Install dependencies:

```bash
npm install @nomiclabs/hardhat-ethers
```

sign up for infura and replace YOUR_INFURA_PROJECT_ID

Create `.env`:

```env
SEPOLIA_RPC_URL=https://goerli.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_private_key_without_0x
```

Edit `hardhat.config.js`:

```js
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.4",
  networks: {
    goerli: {
      url: process.env.GOERLI_RPC_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
```


---

### 4. 🚀 Deploy Contract

Create `scripts/deploy.js`:

```js
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
```
---

### 5. 🔍 (Optional) Generate & Verify Proof

Prepare input JSON:

```json
{
  "a": "3",
  "b": "11"
}
```

```json
{
    "bankKycSignatureR": [
        "12477866811219255592",
        "3641452454142713473",
        "5630979540933110489",
        "15394048600215191899"
    ],
    "bankKycSignatureS": [
        "10728334430210397361",
        "15193483341721690024",
        "10174484065405913601",
        "2483378907701409173"
    ],
    "ssnHash": [
        "7374107597115428998",
        "11092124231272996114",
        "6296019104128614153",
        "11939832897997219210"
    ],
    "bankKycPubkey": [
        [
            "9184773858684377495",
            "5927304186272187413",
            "12089562503757628376",
            "6366437046742599612"
        ],
        [
            "5955600346341698435",
            "9884649706556557486",
            "14629691176244201136",
            "5929242828578721734"
        ]
    ]
}
```

Run:

```bash
snarkjs wtns calculate multiplier_js/multiplier.wasm input.json witness.wtns
snarkjs zkey export verificationkey multiplier_final.zkey verification_key.json

snarkjs groth16 prove multiplier_final.zkey witness.wtns proof.json public.json
snarkjs groth16 verify verification_key.json public.json proof.json

# ECDSA
# execution ~ 40 sec
snarkjs wtns calculate ecdsa-verify_js/ecdsa-verify.wasm input-ecdsa.json witness-ecdsa.wtns
snarkjs zkey export verificationkey ecdsa-verify_final.zkey verification-ecdsa_key.json

# 5 sec
snarkjs groth16 prove ecdsa-verify_final.zkey witness-ecdsa.wtns proof-ecdsa.json public-ecdsa.json
snarkjs groth16 verify verification-ecdsa_key.json public-ecdsa.json proof-ecdsa.json

```


Export Solidity verifier:

```bash
snarkjs zkey export solidityverifier multiplier_final.zkey Verifier.sol

# ECDSA
snarkjs zkey export solidityverifier ecdsa-verify_final.zkey ECDSAVerifier.sol
```
modify smart contracts to store something on blockchain, they are view-only by default
```solidity

uint[2] public lastVerified;
function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[9] calldata _pubSignals) public returns (bool) {
    lastVerified = _pA;
```

Move `*Verifier*.sol` to `contracts/`.
change teh contract name in solidity to ECDSAGroth16Verifier // todo find a cmd line
Compile `npx hardhat compile`


Deploy to Sepolia:

```bash
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/deploy-ecdsa.js --network sepolia
```
---

Play Transaction:
```bash
npx hardhat run scripts/verify.js --network sepolia
npx hardhat run scripts/verify-ecdsa.js --network sepolia
```

## ✅ Summary

You’ve now:
- Created a Circom ZKP circuit
- Set up a trusted ceremony and generated a Solidity verifier
- Deployed a verifier contract to the Goerli testnet
- (Optionally) Generated and tested a ZKP proof

---

## 📬 Results?
The price is only up to the number of public outputs, not the circuit complexity

1. [Multiplier, tx fee: 0.00002191](https://sepolia.arbiscan.io/address/0xD2d1dBec05e39872Efce0DB80C17f62F95821db7)
2. [tx fee: 0.00003143](https://sepolia.arbiscan.io/address/0xb3d83BA5A3b6f78F7DE1C86Df63dd66F23e5b26f)

3. [Multiplier tx: 0xafd7baf12980d1d929d86a7496f987e04224fb47024fd4143d7f26737afa383e](https://sepolia.arbiscan.io/tx/0xafd7baf12980d1d929d86a7496f987e04224fb47024fd4143d7f26737afa383e)
4. [ECDSA tx: 0x849f18ead30026924a410e12afa7b2c57bb208790b6eba241641d8c2e26c64f2](https://sepolia.arbiscan.io/tx/0x849f18ead30026924a410e12afa7b2c57bb208790b6eba241641d8c2e26c64f2)


# 🛠️ Solana Integration for Groth16 ZKP Verifier

This section demonstrates how to deploy and verify a Groth16 zero-knowledge proof (ZKP) on **Solana**, using Rust and the Arkworks zk-SNARK library.

---

## 📦 Prerequisites

You need to have:

- Rust + Solana toolchain:
```bash
rustup install stable
cargo install --git https://github.com/solana-labs/solana --locked
```

- Arkworks dependencies in `Cargo.toml`:
```toml
[dependencies]
ark-groth16 = "0.3"
ark-bn254 = "0.3"
ark-serialize = "0.3"
```

---

## 🔧 Convert SnarkJS Proof to Arkworks Format

You will need:

- `verification_key.json`
- `proof.json`
- `public.json`

Use a custom script or utility to convert these into Arkworks `VerifyingKey`, `Proof`, and `Vec<Fr>` types. You can serialize these into `bincode` or raw bytes and include them in your Solana contract.

---

## 📂 Solana Program Example

A minimal verifier contract in Rust might look like:

```rust
use ark_bn254::{Bn254, Fr};
use ark_groth16::{Groth16, Proof, VerifyingKey, prepare_verifying_key, verify_proof};
use ark_serialize::CanonicalDeserialize;

pub fn verify_groth16(
    vk_bytes: &[u8],
    proof_bytes: &[u8],
    public_inputs: Vec<Fr>,
) -> bool {
    let vk = VerifyingKey::<Bn254>::deserialize(vk_bytes).unwrap();
    let proof = Proof::<Bn254>::deserialize(proof_bytes).unwrap();
    let pvk = prepare_verifying_key(&vk);

    verify_proof(&pvk, &proof, &public_inputs).unwrap_or(false)
}
```

To use in Solana:
- Compile with `cargo build-bpf`
- Deploy with:
```bash
solana program deploy target/deploy/your_zk_program.so
```

---

## 🧪 Client/Frontend Side

Use SnarkJS in your web app:
```js
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);

// send proof and publicSignals to Solana program for verification
```

---

## ✅ Summary for Solana

This allows you to validate Ethereum-compatible Groth16 proofs inside a Solana program using native Rust logic.

For more advanced implementations (e.g., Poseidon hash support or circuit optimizations), refer to [Arkworks documentation](https://github.com/arkworks-rs).

