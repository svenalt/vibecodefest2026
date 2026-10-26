// Checks ios/YamnetAudit.swift without Xcode or MediaPipe (REQ-012):
//   npm run check-ios-audit
// Uses the shared top-K parity cases that the Kotlin and TypeScript tests also read.
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String) {
  if !ok {
    failures += 1
    print("FAIL: \(what)")
  }
}
func label(_ i: Int) -> String { "class \(i)" }

let path = CommandLine.arguments.dropFirst().first ?? "modules/soundcanvas-audio/test-fixtures/topk-parity.txt"
let cases = try! String(contentsOfFile: path, encoding: .utf8)
  .split(separator: "\n")
  .filter { !$0.hasPrefix("#") && !$0.isEmpty }
check(cases.count == 5, "five parity cases")

var generator = SystemRandomNumberGenerator()
for line in cases {
  let parts = line.split(separator: "|")
  let name = String(parts[0])
  let expected = parts[1].split(separator: ",").map { Int($0)! }
  let scores = parts[2].split(separator: ",").map { Float(String($0))! }
  // MediaPipe's own order is not guaranteed; the audit must not depend on it.
  let all = scores.enumerated().map { ClassScore(index: $0.offset, label: label($0.offset), score: $0.element) }
    .shuffled(using: &generator)
  let top = try! ClassificationAudit.audit(all)
  check(top.map(\.index) == expected, "\(name): \(top.map(\.index)) != \(expected)")
}

func rejects(_ all: [ClassScore], _ what: String) {
  do {
    _ = try ClassificationAudit.audit(all)
    check(false, "rejects \(what)")
  } catch is ModelContractError {
  } catch {
    check(false, "rejects \(what) with a contract error")
  }
}
let full = (0..<YamnetContract.numClasses).map { ClassScore(index: $0, label: label($0), score: 0.01) }
rejects(Array(full.prefix(10)), "a truncated result")
rejects(full + [ClassScore(index: 0, label: label(0), score: 0.5)], "an extra class")
rejects(full.map { $0.index == 5 ? ClassScore(index: 4, label: label(4), score: 0.5) : $0 }, "a duplicate index")
rejects(full.map { $0.index == 5 ? ClassScore(index: 521, label: "x", score: 0.5) : $0 }, "an index out of range")
rejects(full.map { $0.index == 5 ? ClassScore(index: 5, label: label(5), score: .nan) : $0 }, "a NaN score")
rejects(full.map { $0.index == 5 ? ClassScore(index: 5, label: label(5), score: .infinity) : $0 }, "an infinite score")
check(try! ClassificationAudit.audit(full).count == YamnetContract.topK, "keeps exactly the top \(YamnetContract.topK)")

print(failures == 0 ? "iOS audit: all checks passed (\(cases.count) parity cases)" : "iOS audit: \(failures) failures")
exit(failures == 0 ? 0 : 1)
