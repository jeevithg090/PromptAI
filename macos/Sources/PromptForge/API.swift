import Foundation

public class PromptForgeAPI {
  private let apiKey: String
  private let baseURL: URL

  public init(apiKey: String, baseURL: String) {
    self.apiKey = apiKey
    self.baseURL = URL(string: baseURL) ?? URL(string: "http://localhost:3001")!
  }

  public func draft(idea: String, platform: String) async throws -> Data {
    var req = URLRequest(url: baseURL.appendingPathComponent("/api/draft"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

    let body: [String: Any] = [
      "platform_id": platform.lowercased(),
      "idea": idea,
    ]
    req.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: req)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw PromptForgeError.invalidResponse
    }
    guard (200...299).contains(httpResponse.statusCode) else {
      throw PromptForgeError.httpError(httpResponse.statusCode)
    }
    return data
  }
}

public enum PromptForgeError: Error {
  case invalidResponse
  case httpError(Int)
}
