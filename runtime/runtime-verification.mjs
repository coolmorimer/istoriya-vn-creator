// Ren'Py may recover from an init exception and still report successful tests.
// A successful process/report never overrides a traceback in that same run.
export function runtimeException(output = '') {
  return /Full traceback:|Traceback \(most recent call last\):|While running game code:|An exception has occurred|uncaught exception|ModuleNotFoundError:/i.test(output);
}

export function parseRuntimeReport(output, exitCode, expectedCases) {
  const cases = output.match(/Test cases\s*:\s*(\d+)\s*\|\s*(\d+) passed/);
  const assertions = output.match(/Assertions\s*:\s*(\d+)\s*\|\s*(\d+) passed/);
  const result = {cases:Number(cases?.[1]??0),passedCases:Number(cases?.[2]??0),assertions:Number(assertions?.[1]??0),passedAssertions:Number(assertions?.[2]??0),runtimeException:runtimeException(output)};
  return {...result,passed:exitCode===0&&!result.runtimeException&&expectedCases>0&&/\[rpytest\] Status: PASSED/.test(output)&&result.cases===expectedCases&&result.passedCases===expectedCases&&result.assertions===result.passedAssertions};
}
