namespace Arcana.Infrastructure.Firebase;

public class CloudinaryOptions
{
    public const string Section = "Cloudinary";

    public string CloudName { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
    public string UploadPreset { get; set; } = string.Empty;
    public string AssetBaseUrl { get; set; } = string.Empty;
}
