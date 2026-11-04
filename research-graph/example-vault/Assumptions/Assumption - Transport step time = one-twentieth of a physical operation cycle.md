---
id: assumption-transport-time-one-twentieth
node_type: assumption
title: Transport step time = one-twentieth of a physical operation cycle
assumption_category: Timing
parameter: transport_time_to_physical_operation_cycle
value: 1/20
unit: ratio
relationships:
- type: assumed_by
  target: '[[Contribution - Moving qubit model]]'

---

# Transport step time = one-twentieth of a physical operation cycle

Assumes that one qubit-transport step takes $1/20$ of a physical operation cycle.

## Used by

- [[Contribution - Moving qubit model]]
