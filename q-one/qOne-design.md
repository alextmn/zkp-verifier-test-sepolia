
# qOne Coin high-level design

qOne Wallet App implemented as a web application

qOne Wallet App initiates a transfer and signs the one atomic transaction

User enters Falcon-512 private key to sign the transaction in ZKP implemented as Circom Groth16, producing the proof

qOne Wallet App calls WalletConnect SDK to sign the transaction using EC key and send it to blockchain

# End-to-End Flow

1. **qOne Wallet App (web dApp)**

   * Implemented as a web application.
   * Provides the user interface for transfers and swaps.

2. **Transaction initiation**

   * The qOne Wallet App initiates a transfer or swap request.
   * The action will ultimately be submitted as **one atomic Ethereum transaction**.

3. **ZKP generation (off-chain)**

   * The user supplies their Falcon-512 private key to the local prover (never on-chain).
   * A Circom Groth16 circuit verifies the Falcon-512 signature and any additional constraints.
   * The prover outputs a **zero-knowledge proof** attesting that the Falcon-512 verification succeeded.

4. **Blockchain signing (EC only)**

   * The qOne Wallet App calls **WalletConnect SDK**, which asks the user’s wallet (e.g. MetaMask) to sign the Ethereum transaction.
   * The transaction is signed with the wallet’s standard **ECDSA (EC) key**, the same as any Ethereum transaction.
   * No PQC keys are ever exposed to the blockchain.

---

# One Atomic Ethereum Transaction (EC sig only)
- UNLOCK using ZKP
- ERC-20 TRANSER

* The dApp submits a call to the **ZK Router** contract (`zkTransfer` or `zkDexCall`) with parameters:
  `{ proof, deadline, amount, recipient/router, … }`.

* **User action:** the user approves and signs this transaction via WalletConnect using their EC wallet key.

* **On-chain flow:**

  1. The ZK Router verifies the submitted proof against the expected action parameters.
  2. If the proof is valid:

     * For a transfer → it calls `QONE.transferFrom(...)`.
     * For a swap → it forwards the call to the specified DEX router.
  3. If the proof is invalid → the transaction reverts, and no state changes occur.

* **Atomicity guarantee:** either the entire sequence (proof check + ERC-20/DEX action) executes successfully, or the transaction fails and nothing is applied.


```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Very simple ZK Router for one ERC-20 (QONE).
 * - Keeps QONE standard (no hooks).
 * - Verifies a ZK proof, then:
 *   (A) transfers QONE using transferFrom, OR
 *   (B) forwards QONE to a DEX router call you provide.
 *
 * NOTE (keep it simple):
 * - No reentrancy guard, no nullifier store, no permit in this tiny version.
 * - Add those later for production.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function approve(address spender, uint256 v) external returns (bool);
}

interface IVerifier {
    // Return true if `proof` is valid for `publicHash`
    function verify(bytes calldata proof, bytes32 publicHash) external view returns (bool);
}

contract QoneSimpleZkRouter {
    IERC20   public immutable QONE;
    IVerifier public immutable VERIFIER;

    error InvalidProof();
    error CallFailed();

    constructor(address qone, address verifier) {
        QONE = IERC20(qone);
        VERIFIER = IVerifier(verifier);
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    // Bind mutable params so a proof can’t be replayed for other actions
    function _hash(
        uint8   action,        // 0 = transfer, 1 = dexCall
        address caller,
        address a1,            // for transfer: recipient; for dex: router
        uint256 amount,        // QONE amount for transfer or dex
        uint256 deadline       // unix timestamp
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,
            address(this),
            caller,
            action,
            a1,
            amount,
            deadline
        ));
    }

    // ------------------------------------------------------------
    // (A) ZK-gated transfer of QONE
    // Requires the caller to have approved this router for `amount`.
    // ------------------------------------------------------------
    function zkTransfer(
        address to,
        uint256 amount,
        uint256 deadline,
        bytes calldata proof
    ) external {
        require(block.timestamp <= deadline, "DEADLINE");
        bytes32 H = _hash(0, msg.sender, to, amount, deadline);
        if (!VERIFIER.verify(proof, H)) revert InvalidProof();

        // move tokens
        bool ok = QONE.transferFrom(msg.sender, to, amount);
        require(ok, "TRANSFER_FROM_FAIL");
    }

    // ------------------------------------------------------------
    // (B) ZK-gated swap via ANY DEX router
    // You pass:
    //  - router: DEX router address (UniswapV2/V3, Sushi, etc.)
    //  - amountIn: how many QONE to send in
    //  - data: exact calldata for the router (already ABI-encoded)
    //
    // Flow:
    //  - verify proof bound to (router, amountIn, deadline)
    //  - pull QONE from user
    //  - approve router for amountIn
    //  - low-level call(router, data)
    //  - reset approval to 0 (hygiene)
    // ------------------------------------------------------------
    function zkDexCall(
        address router,
        uint256 amountIn,
        uint256 deadline,
        bytes calldata proof,
        bytes calldata data
    ) external returns (bytes memory ret) {
        require(block.timestamp <= deadline, "DEADLINE");
        require(router != address(0) && amountIn > 0, "BAD_PARAMS");

        bytes32 H = _hash(1, msg.sender, router, amountIn, deadline);
        if (!VERIFIER.verify(proof, H)) revert InvalidProof();

        // pull QONE in and approve router
        require(QONE.transferFrom(msg.sender, address(this), amountIn), "TRANSFER_FROM_FAIL");
        require(QONE.approve(router, 0), "APPROVE0_FAIL");
        require(QONE.approve(router, amountIn), "APPROVE_FAIL");

        // forward the exact calldata to the DEX router
        (bool ok, bytes memory out) = router.call(data);
        // reset approval (best-effort)
        QONE.approve(router, 0);
        if (!ok) revert CallFailed();
        return out;
    }
}
```

# Next Priorites
0. No Need for any wallet extentions, like Snaps
1. We need to build a similar Router for HyperEVM (our custom). 
2. We need to implement this Router to make sure it fully works
3. HyperSwap’s architecture is modeled after Uniswap, specifically the Uniswap V2 style and it supports Routers we need to make sure it fully works.
4. We make sure we can do Bridges too
- Lock qOne ERC-20 + ZKP on HyperEVM.
- Mint qOne wrapped ERC-20 + ZKP on Ethereum.
5.  for ZKP the hash is POSIDON, not keccak256
