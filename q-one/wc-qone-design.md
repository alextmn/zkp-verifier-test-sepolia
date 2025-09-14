# Wallet Connect: Big picture / ZKP proof

You’ll ship a Router *wrapper* (call it **ZKRouter**) that:

1. **Verifies the ZK proof on-chain**, then
2. **executes the actual swap** by calling Uniswap’s router (e.g., V3 `SwapRouter` / `UniversalRouter`).

Your **wallet** (mobile/web/desktop) uses **WalletConnect v2** to receive `eth_sendTransaction` from your dApp, or to originate the tx itself, and **ABI-encodes the proof + swap params** into a call to `ZKRouter.swapWithProof(...)`.

This keeps Uniswap unchanged and your token/logic clean.

---

# Contract design (Solidity)

### 1) Verifier interface (Groth16 example)

If you’re using Groth16 (Circom → snarkJS), your on-chain verifier looks like:

```solidity
interface IGroth16Verifier {
    // typical Groth16 verify function signature
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicSignals
    ) external view returns (bool);
}
```

### 2) ZKRouter wrapper

* Accepts the **proof** + **publicSignals** + **swap params**.
* **Binds** the proof to critical fields (user, amountIn, minOut, tokenIn, tokenOut, chainId, deadline, nonce).
* On success, performs the Uniswap swap.

Below is a minimal pattern that composes with **Permit2** (safer allowances) and Uniswap V3’s **SwapRouter**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 value) external returns (bool);
}

interface IPermit2 {
    struct PermitSingle {
        address token;
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }
    struct SignatureTransferDetails { address to; uint256 requestedAmount; }
    struct PermitTransferFrom {
        // details + permitted token
        // (use exact structs from Permit2 repo)
    }
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicSignals
    ) external view returns (bool);
}

contract ZKRouter {
    IGroth16Verifier public immutable verifier;
    IPermit2 public immutable permit2;
    ISwapRouterV3 public immutable uniswap;

    mapping(bytes32 => bool) public usedNonces; // replay guard

    constructor(address _verifier, address _permit2, address _uniswap) {
        verifier = IGroth16Verifier(_verifier);
        permit2 = IPermit2(_permit2);
        uniswap = ISwapRouterV3(_uniswap);
    }

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[] publicSignals; // must encode: owner, tokenIn, tokenOut, amountIn, minOut, chainId, deadline, nonceHash, etc.
    }

    struct SwapArgs {
        address owner;          // who pays tokenIn
        address tokenIn;
        address tokenOut;
        uint24  fee;
        uint256 amountIn;
        uint256 minOut;
        uint256 deadline;
        bytes32 nonce;          // included in publicSignals digest
    }

    // Optional: pass a Permit2 signature so ZKRouter can pull tokenIn directly from owner
    struct PermitBundle {
        IPermit2.PermitTransferFrom permit;
        IPermit2.SignatureTransferDetails xfer;
        bytes signature;
    }

    function swapExactTokensWithProof(
        Proof calldata proof,
        SwapArgs calldata args,
        PermitBundle calldata permitBundle
    ) external returns (uint256 amountOut) {
        require(block.timestamp <= args.deadline, "expired");
        require(!usedNonces[args.nonce], "nonce used");

        // 1) Verify the ZK proof
        //    Inside your circuit you hash/bind (owner, tokenIn, tokenOut, amountIn, minOut, chainId, deadline, nonce)
        //    into publicSignals. Recompute/validate the same binding here by checking publicSignals values.
        require(verifier.verifyProof(proof.a, proof.b, proof.c, proof.publicSignals), "bad proof");

        // 2) Mark nonce used to prevent replay
        usedNonces[args.nonce] = true;

        // 3) Pull tokenIn from owner into this router via Permit2
        //    (permitBundle.xfer.to MUST be address(this), amount MUST equal args.amountIn)
        permit2.permitTransferFrom(
            permitBundle.permit,
            permitBundle.xfer,
            args.owner,
            permitBundle.signature
        );

        // 4) Approve Uniswap Router to spend tokenIn (use safe allowance handling in production)
        IERC20(args.tokenIn).approve(address(uniswap), args.amountIn);

        // 5) Do the swap
        ISwapRouterV3.ExactInputSingleParams memory p = ISwapRouterV3.ExactInputSingleParams({
            tokenIn: args.tokenIn,
            tokenOut: args.tokenOut,
            fee: args.fee,
            recipient: args.owner,         // send output to owner (or msg.sender or a chosen recipient)
            deadline: args.deadline,
            amountIn: args.amountIn,
            amountOutMinimum: args.minOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = uniswap.exactInputSingle(p);
    }
}
```

**Why this pattern?**

* **Compatibility:** Uniswap stays untouched; your wrapper sits in front.
* **Safety:** The **proof** gates the swap. No proof → no swap.
* **Clean UX:** Use **Permit2** so the user doesn’t need to pre-approve the wrapper contract; they sign a one-time EIP-712 permit in the wallet, then the tx executes with the proof.

> Alternative: If your ERC-20 itself must be “locked” by ZK rules, implement an **on-chain unlock** (proof → set spendRight) that `transferFrom` checks. The wrapper approach is usually simpler to deploy and iterate.

---

# What goes in the ZK proof?

Design your circuit so it proves statements like:

* The user is authorized.
* The **binding** to on-chain intent:

  ```
  // TODO:, example is here:
  H = Poseidon(owner | tokenIn | tokenOut | amountIn | minOut | chainId | deadline | nonce)
  ```

  Expose `H` (and/or each value) as `publicSignals`; the contract re-checks that these match `SwapArgs`.
  This kills replay / cross-context use.

---

# Wallet implementation (with WalletConnect)

Your wallet needs to:

1. **Pair via WalletConnect v2** (namespace `eip155`).
2. **Build & sign** a tx to your **ZKRouter.swapExactTokensWithProof**.
3. **(Optional)** Build the **Permit2** EIP-712 signature first (off-chain), include it as `permitBundle.signature`.
4. **Broadcast** tx via your RPC (Infura/Alchemy/self-hosted).

### Minimal TypeScript sketch (wallet side)

```ts
import { ethers } from "ethers";
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit"; // or @walletconnect/web3wallet
import ZKRouterAbi from "./abi/ZKRouter.json";

const CORE_PROJECT_ID = "<your_wc_project_id>";
const RPC = "https://mainnet.infura.io/v3/<key>"; // or any chain RPC
const provider = new ethers.JsonRpcProvider(RPC);

// 1) Init WalletConnect wallet
const core = new Core({ projectId: CORE_PROJECT_ID });
const walletKit = await WalletKit.init({ core, metadata: {
  name: "MyZKWallet",
  description: "ZK wallet",
  url: "https://example.com",
  icons: ["https://example.com/icon.png"]
}});

// approve sessions etc... (not shown)

// 2) When your app wants to submit a swap, build calldata
const zkRouter = new ethers.Interface(ZKRouterAbi);

// (a) Off-chain generate Permit2 EIP-712 signature for the owner
// (b) Build proof + publicSignals from your ZK prover
const proof = {
  a: [/*2*/],
  b: [[/*2*/],[/*2*/]],
  c: [/*2*/],
  publicSignals: [/*...*/]
};

const args = {
  owner: "0xOwner",
  tokenIn: "0xTokenIn",
  tokenOut: "0xTokenOut",
  fee: 3000,
  amountIn: ethers.parseUnits("1000", 6),
  minOut: ethers.parseUnits("0.5", 18),
  deadline: Math.floor(Date.now()/1000) + 1200,
  nonce: "0x<32 bytes>"
};

const permitBundle = {
  permit: {/* Permit2 struct */},
  xfer:   {/* transfer details with to = ZKRouter */},
  signature: "0x..."
};

const data = zkRouter.encodeFunctionData(
  "swapExactTokensWithProof",
  [proof, args, permitBundle]
);

// 3) Send via WalletConnect as eth_sendTransaction (if dApp-initiated), or sign+send directly from your wallet
const txRequest = {
  from: args.owner,
  to:   "0xZKRouter",
  data,
  value: "0x0",
  gas:  "0x5208" // estimate properly
};

// If acting as the wallet, you sign & send with your signer:
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const tx = await signer.sendTransaction(txRequest);
console.log("txHash", tx.hash);
```

> If Uniswap (the dApp) is initiating, it will send `eth_sendTransaction` over WalletConnect; your wallet should display a nice summary (decode calldata → “Swap 1000 USDC → ≥0.5 ETH via ZKRouter”), then sign & broadcast.

---

# Key security details to get right

* **Bind the proof** to `(owner, tokenIn, tokenOut, amountIn, minOut, chainId, deadline, nonce)` and verify the same on-chain.
* **Replay protection:** per-user nonce tracked in contract and included in proof.
* **Deadline:** enforce `block.timestamp <= deadline`.
* **Allowance path:** Prefer **Permit2** to avoid sticky infinite approvals; or use per-tx exact approvals.
* **Proof size/gas:** Groth16 fits well (a,b,c \~ 8×32B + public signals). For Plonk/FRI, consider calldata/gas tradeoffs (you can compress and de-compress in contract only if your verifier allows it).
* **Upgradability:** Keep ZKRouter thin; swap verifier address behind a governance timelock if you must update circuits.

---

# Alternatives (when it makes sense)

* **Token-gated ERC-20:** Your ERC-20 enforces `transferFrom` only if `unlockProof(owner, amt, nonce, ...)` was called. More invasive but self-contained.
* **ERC-4337 Account Abstraction:** Bundle “verify proof → pull funds → swap” in a single UserOp. Nice UX, more moving parts.
* **EIP-712 “Permit-and-Swap” meta-tx:** Off-chain sign intent with proof hash; a relayer executes on chain. Good if users lack gas.

