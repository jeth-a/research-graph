# Big Picture — QEC Research

## Research goal

Find research **gaps** and develop something **useful**.

A contribution may be useful when it:
1. Generalizes an existing method to new settings.
2. Improves an existing figure of merit.
3. Addresses a need explicitly identified by someone.

Potential gaps include:
1. Mismatches among observed facts, assumptions, and hypotheses.
2. Unexplored methods for particular tasks.

**Organizing idea:** Anchor classifications to individual research papers and identify relationships across their contributions.

## Preliminary graph design

Four planned node types: **Paper**, **Contribution**, **Result** (representation not yet decided), and **Assumption**.

Possible ways to identify gaps:
1. Contributions of the same subtype, validated differently, lead to different results.
2. Missing relationships between results and assumptions across different contribution types.
3. Conflicts between assumptions and experimental findings (tentative).

**Implemented in these notes:** Paper, Contribution, and Assumption notes. Results are still stored on Contribution notes rather than in separate Result nodes.

## What to record for each research paper

### 1. Contributions

**Contribution type and subtype**

1. **Physical operations** — Circuit-level operations on physical qubits through control of the quantum device.
   - **Gates:** Physical implementation of unitary operations on physical qubits.
   - **Measurements:** Physical extraction of measurement outcomes, including mid-circuit quantum nondemolition (QND) measurements.
   - **State preparation and reset:** Initialization and reinitialization of physical qubits.
   - **Qubit transport and communication:** Movement of physical qubits or generation and distribution of entanglement between physical qubits.
   - **Other control techniques:** Methods for implementing or improving physical operations, such as pulse shaping.
   - **Mixed:** Combinations of operations, such as a full-architecture physical model.
2. **FT operations** — Logical operations that preserve fault tolerance.
   - **Magic-state protocols:** Preparation, injection, distillation, and consumption of magic states for non-Clifford operations.
   - **Logical gates:** Fault-tolerant implementation of unitary operations.
   - **Logical measurements:** Fault-tolerant measurements of logical observables.
   - **Code surgery:** Logical operations that modify code blocks, such as lattice surgery.
   - **FT memory:** Protocols for preserving logical information over repeated QEC cycles.
   - **FT compilation:** Translation and optimization of quantum computations into executable fault-tolerant operations subject to architectural constraints.
3. **QEC codes** — Construction of quantum error-correcting codes.
   - **Code construction:** Design of quantum codes or code families with specified properties.
4. **Decoding** — Classical processing of syndrome information to infer corrections or logical-frame updates.
   - **Decoding algorithms:** Algorithms that estimate errors or recovery operations from syndrome information.
5. **FT architecture** — Integration of fault-tolerant operations into an architecture.
   - **Hardware-specific:** Architectures designed around a particular hardware platform.
   - **Cross-platform:** Architectures designed to accommodate multiple hardware platforms.
6. **Resource estimation** — Quantification of resources required for specified algorithms, implementations, and assumptions.
   - **Qubit counts:** Estimates or bounds on the number of qubits required for a task under specified runtime constraints.
   - **Connectivity (tentative):** Connectivity requirements for specified tasks.
7. **Physical characterization** — Determination of properties or performance metrics of quantum devices and operations.
   - **Coherence time:** $T_1$ and $T_2$.
   - **Quantum-operation metrics:** Fidelity, crosstalk, leakage, and related metrics.
8. **Resource estimation methodology** — Methods for estimating resources, deriving resource bounds, or proving impossibility results.
   - **Statistical:** Statistical inference, sampling, or uncertainty analysis.
   - **Simulation:** Numerical methods.
   - **Analytic:** Mathematical models or proofs.
9. **Physical characterization methodology** — Methods for determining performance metrics of physical operations.
   - **Tomographic methods:** Reconstruction of quantum states, processes, or measurements from experimental data.
   - **Direct measurements and randomized benchmarking:** Targeted characterization without full tomography.
   - **Noise learning:** Inference of noise processes and model parameters from experimental data.
10. **Quantum algorithms and applications**.
11. **Other**.

**Additional information for each contribution**
1. **Validation methods:** Experimental, Numerical, or Analytic.
2. **Results:** Findings or quantitative outcomes (recorded in the Markdown Results section, not YAML attributes).
3. **Assumptions:** Links to reusable Assumption notes via `assumes` relationships.
4. **Possible improvements:** Hypotheses or open questions worth exploring.

### 2. Paper information

Date, authors, affiliations, and associated contributions.
