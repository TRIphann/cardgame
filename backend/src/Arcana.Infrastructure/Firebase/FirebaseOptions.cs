namespace Arcana.Infrastructure.Firebase;

public class FirebaseOptions
{
    public const string Section = "Firebase";

    public string ProjectId { get; set; } = string.Empty;

    /// <summary>Path to service account JSON file (used in local development).</summary>
    public string CredentialsFilePath { get; set; } = string.Empty;

    /// <summary>Base64-encoded service account JSON (used in production/Render).</summary>
    public string CredentialsBase64 { get; set; } = string.Empty;
}
