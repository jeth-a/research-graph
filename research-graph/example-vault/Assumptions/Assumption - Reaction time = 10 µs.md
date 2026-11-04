---
id: assumption-reaction-time-10us
node_type: assumption
title: Reaction time = 10 µs
assumption_category: Timing
parameter: reaction_time
value: 1e-5
unit: s
relationships:
- type: assumed_by
  target: '[[Contribution - Resource estimate for 2048-bit RSA factorization]]'
- type: assumed_by
  target: '[[Contribution - Resource estimate for Fermi-Hubbard model]]'

---

# Reaction time = 10 µs

Assumes a reaction time of $10\,\mu\mathrm{s}$ ($10^{-5}$ s), ten times the $1\,\mu\mathrm{s}$ code cycle time in the baseline Pinnacle estimates. The paper generally assumes reaction time is ten times the code cycle time.

## Used by

- [[Contribution - Resource estimate for 2048-bit RSA factorization]]
- [[Contribution - Resource estimate for Fermi-Hubbard model]]
