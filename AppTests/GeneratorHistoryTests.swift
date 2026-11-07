import XCTest

final class GeneratorHistoryTests: XCTestCase {
    func testNewestFirstWithItsSite() {
        var history: [GeneratorHistoryEntry] = []
        history = GeneratorHistory.remembering("first", kind: "password", site: "a.example", in: history)
        history = GeneratorHistory.remembering("second", kind: "passphrase", site: "b.example", in: history)
        XCTAssertEqual(history.map(\.value), ["second", "first"])
        XCTAssertEqual(history.map(\.site), ["b.example", "a.example"])
        XCTAssertEqual(history.first?.kind, "passphrase")
    }

    func testIgnoresEmptyAndImmediateRepeats() {
        var history = GeneratorHistory.remembering("same", kind: "password", in: [])
        history = GeneratorHistory.remembering("same", kind: "password", in: history)
        history = GeneratorHistory.remembering("", kind: "password", in: history)
        XCTAssertEqual(history.map(\.value), ["same"])
    }

    func testKeepsOnlyTheNewestFifty() {
        var history: [GeneratorHistoryEntry] = []
        for n in 0..<(GeneratorHistory.limit + 5) {
            history = GeneratorHistory.remembering("v\(n)", kind: "password", in: history)
        }
        XCTAssertEqual(history.count, GeneratorHistory.limit)
        XCTAssertEqual(history.first?.value, "v\(GeneratorHistory.limit + 4)")
        XCTAssertEqual(history.last?.value, "v5")
    }

    /// Only values made for a web page are kept (`tw generate` in a terminal has no page), labelled by its site.
    func testSiteComesFromTheExtensionsPageURL() {
        XCTAssertEqual(GeneratorHistory.site(fromPageURL: "https://www.GitHub.com/signup?x=1"), "github.com")
        XCTAssertEqual(GeneratorHistory.site(fromPageURL: "http://shop.example/register"), "shop.example")
        XCTAssertNil(GeneratorHistory.site(fromPageURL: nil))
        XCTAssertNil(GeneratorHistory.site(fromPageURL: "file:///Users/me/page.html"))
        XCTAssertNil(GeneratorHistory.site(fromPageURL: "safari-web-extension://abc/popup.html"))
        XCTAssertNil(GeneratorHistory.site(fromPageURL: "not a url"))
    }
}
