/// A single typed prompt node within a draft result.
public struct PromptNode: Codable, Sendable {
  public let type: String
  public let value: String
  public let alternatives: [String]

  public init(type: String, value: String, alternatives: [String] = []) {
    self.type = type
    self.value = value
    self.alternatives = alternatives
  }
}

/// The response returned by a PromptForge draft request.
public struct DraftResult: Codable, Sendable {
  public let assembled: String
  public let strengthScore: Int
  public let nodes: [PromptNode]

  public init(assembled: String, strengthScore: Int, nodes: [PromptNode]) {
    self.assembled = assembled
    self.strengthScore = strengthScore
    self.nodes = nodes
  }
}

/// The public client protocol every SDK consumer uses.
///
/// Conforming types connect to a PromptForge backend and submit drafting
/// requests. The live implementation wraps URLSession; mock implementations
/// are used in tests.
public protocol PromptForgeClient: Sendable {
  /// Submit an idea for a specific platform and receive the drafted result.
  func draft(idea: String, platform: String) async throws -> DraftResult
}

/// Default live implementation that calls the PromptForge backend API.
///
/// - Note: This is a scaffold. Wire to the actual backend in a follow-up.
///   TODO: wire to backend
public struct PromptForgeClientLive: PromptForgeClient {
  private let baseURL: String
  private let apiKey: String

  public init(baseURL: String, apiKey: String) {
    self.baseURL = baseURL
    self.apiKey = apiKey
  }

  public func draft(idea: String, platform: String) async throws -> DraftResult {
    // TODO: wire to backend — implement real URLSession call
    throw PromptForgeKitError.notImplemented
  }
}

public enum PromptForgeKitError: Error {
  case notImplemented
  case networkError(Error)
  case decodingError(Error)
  case httpError(Int)
}
