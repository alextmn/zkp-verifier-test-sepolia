
## How to achive Falcon native Hash2Point

* **Wallet** does the heavy lifting:
  It computes

  $$C = \text{SHAKE256}(r \| M)$$

  where $M$ is your transaction hash (or message).

* **Circuit** only checks:

  1. The Falcon verification algebra:

     $$s_1 + s_2 \cdot h \equiv C \pmod{q,\,x^n+1}$$
  2. That the $C$ used is bound to $M$ via your reconstruction trick (differences $D_i = C_i - M_i$, or any equivalent compression).

---

## Why it still counts as “Falcon-like and secure”

* The true Falcon binding is **“C comes from SHAKE256(r∥M)”**.
* As long as the **wallet is honest**, this is *exactly Falcon*.
* The ZKP guarantees:

  * The same $C$ that was used to produce the signature is the one checked in the algebra.
  * That $C$ is bound to the public transaction hash $M$.

So the verifier knows:

* *If the wallet followed the spec*, then this proof corresponds to a real Falcon signature on $M$.
* Even if the wallet lied about SHAKE256, the proof can’t be reused on another $M'$ because $C$ is bound to the published $M$.


##  Bottom line

* It’s still using SHAKE256,
* It’s still bound to the transaction hash $M$,
* And even if the SHAKE256 step isn’t enforced inside the circuit, the scheme remains **secure and Falcon-line** because the proof can’t be repurposed for a different $M$.

