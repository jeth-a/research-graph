---
id: contribution-moving-qubit-model
node_type: contribution
title: Moving qubit model
contribution_type: Physical operations
contribution_subtype: Mixed
validation_methods: Analytic and Experimental
level: 0
relationships:
- type: part_of_paper
  target: '[[Paper - Walking cat architecture]]'
- type: based_on
  target: Physical Pauli frame tracking
- type: based_on
  target: Fully connected model
- type: assumes
  target: '[[Assumption - Depolarizing noise model]]'
- type: assumes
  target: '[[Assumption - Physical error rate = 10^-4]]'
- type: assumes
  target: '[[Assumption - Transport step time = one-twentieth of a physical operation cycle]]'
- type: assumes
  target: '[[Assumption - Leakage error rate = 10^-5]]'
- type: assumes
  target: '[[Assumption - Idle error rate = 10^-6]]'

---

# Moving qubit model

**Contribution type:** Physical operations

**Contribution subtype:** Mixed

**Validation methods:** Analytic and Experimental

## Results

- Develops a physical model covering operations such as state preparation, gates, and qubit transport. The model includes circuit-level noise, qubit loss, and leakage, with operation times and error parameters motivated by experiments.

## Based on

- Physical Pauli frame tracking
- Fully connected model

## Assumptions

- [[Assumption - Depolarizing noise model]]
- [[Assumption - Physical error rate = 10^-4]]
- [[Assumption - Transport step time = one-twentieth of a physical operation cycle]]
- [[Assumption - Leakage error rate = 10^-5]]
- [[Assumption - Idle error rate = 10^-6]]

**Level:** 0
