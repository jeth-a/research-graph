---
id: assumption-reconfigurable-operations-within-cycle
node_type: assumption
title: Reconfigurable operations within a stabilizer cycle
assumption_category: Hardware constraint
parameter: reconfigurable_operation_schedule
value: transport, gates, and readout fit within one stabilizer cycle regardless of qubit location
unit: null
relationships:
- type: assumed_by
  target: '[[Contribution - Reconfigurable atom array FT architecture]]'

---

# Reconfigurable operations within a stabilizer cycle

Assumes that qubit transport, physical gates, and readout can be completed within a stabilizer cycle regardless of where the qubits are located.

## Used by

- [[Contribution - Reconfigurable atom array FT architecture]]
