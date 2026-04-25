# Example Runner

## Mission
Create the first runner for the examples catalog so examples become executable fixtures rather than static documentation.

## Scope

- loader for example fixtures
- schema validation
- assertion runner for expected outputs
- mailbox-specialized execution path if needed

## Deliverables

### 1. Fixture Loader

Load examples from the top-level catalog.

### 2. Schema Validation

Reject malformed or incomplete example fixtures.

### 3. Assertion Execution

Run examples through the relevant evaluation surface and compare actual versus expected outputs.

### 4. Draft Handling

Allow fixtures with `status: draft`, but do not treat them as passing executable examples.

## Definition Of Done

- [ ] example loader exists
- [ ] schema validation exists
- [ ] assertable examples can be executed
- [ ] draft fixtures are handled explicitly
