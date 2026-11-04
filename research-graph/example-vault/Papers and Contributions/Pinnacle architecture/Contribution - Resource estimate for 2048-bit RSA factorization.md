---
id: contribution-resource-estimate-for-2048-bit-rsa-factorization
node_type: contribution
title: Resource estimate for 2048-bit RSA factorization
contribution_type: Resource estimation
contribution_subtype: Qubit counts
validation_methods: Numerical
level: 1
relationships:
- type: part_of_paper
  target: '[[Paper - Pinnacle architecture]]'
- type: based_on
  target: '[[Contribution - Pinnacle architecture]]'
- type: assumes
  target: '[[Assumption - Depolarizing noise model]]'
- type: assumes
  target: '[[Assumption - Physical error rate = 10^-3]]'
- type: assumes
  target: '[[Assumption - Code cycle time = 1 µs]]'
- type: assumes
  target: '[[Assumption - Reaction time = 10 µs]]'

---

# Resource estimate for 2048-bit RSA factorization

**Contribution type:** Resource estimation

**Contribution subtype:** Qubit counts

**Validation methods:** Numerical

## Results

- Estimates fewer than 100,000 physical qubits for factoring RSA-2048 integers, approximately an order-of-magnitude improvement over the cited previous resource estimate.

## Based on

- [[Contribution - Pinnacle architecture]]

## Assumptions

- [[Assumption - Depolarizing noise model]]
- [[Assumption - Physical error rate = 10^-3]]
- [[Assumption - Code cycle time = 1 µs]]
- [[Assumption - Reaction time = 10 µs]]

**Level:** 1
