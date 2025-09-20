### ZK-Friendly Falcon Verification (Bound to Transaction Hash -> Falcon Hash To Point)

## Idea
We precompute Falcon’s hash-to-point with SHAKE256 in the wallet, compress it against the message, and let the ZKP circuit reconstruct and verify it — achieving Falcon-compatible verification without the on-chain cost of big SHAKE256 or polynomial commitments.


1. **Off-circuit (Wallet)**

   * Wallet computes

     $$C = \text{SHAKE256}(r \,\|\, M)$$

     where $M$ is the transaction hash or message.
   * Instead of passing the whole $C$ (512 coefficients), the wallet derives a compressed witness $D$, for example

     $$D_i = C_i - M_i$$

     using a fixed windowing of the public message $M$.

2. **In-circuit (ZKP)**

   * Public input: the message $M$.
   * Private witness: the compressed differences $D$.
   * Circuit reconstructs $C$ from $(M, D)$.


3. **On-chain**

   * Only $M$ (public transaction hash) and the ZK proof are published.
   * Full $C$ never appears on chain (saves cost).

---

### ✅ Properties

* **Still Falcon-line**: SHAKE256 is used to derive $C$ exactly as in Falcon, just not re-computed inside the circuit.
* **Bound to the transaction**: Since reconstruction depends on $M$, the proof cannot be reused for a different message.
* **Efficient**: Avoids huge in-circuit SHAKE256 and avoids publishing 512 coefficients on chain.
* **Secured**: Even if the wallet lied about SHAKE256, the proof can’t be reused on another $M$ because $C$ is bound to publish $M$
* **Security assumption**: Wallet must honestly compute $C=\text{SHAKE256}(r\|M)$. The ZK proof guarantees consistency once $C$ is fixed.


