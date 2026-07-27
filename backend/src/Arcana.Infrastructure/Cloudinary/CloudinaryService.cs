using Arcana.Infrastructure.Firebase;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Arcana.Infrastructure.Cloudinary;

public interface ICloudinaryService
{
    /// <summary>Upload a single file (SVG/PNG) to Cloudinary under arcana/decks/{deckId}/cards/</summary>
    Task<CloudinaryUploadResult> UploadCardAssetAsync(Stream fileStream, string fileName, string deckId = "default");

    /// <summary>Upload multiple files at once.</summary>
    Task<IReadOnlyList<CloudinaryUploadResult>> UploadCardAssetsBatchAsync(
        IEnumerable<(Stream stream, string fileName)> files, string deckId = "default");

    /// <summary>Get public URL for a card asset (with optional transformation).</summary>
    string GetCardAssetUrl(string publicId, CardImageFormat format = CardImageFormat.Svg, int? width = null);

    /// <summary>Delete a card asset.</summary>
    Task DeleteCardAssetAsync(string publicId);
}

public record CloudinaryUploadResult(
    string PublicId,
    string SecureUrl,
    int Width,
    int Height,
    long Bytes,
    string Format
);

public enum CardImageFormat
{
    Svg,
    Png,
    Auto, // f_auto
}

public class CloudinaryService : ICloudinaryService
{
    private readonly CloudinaryDotNet.Cloudinary _cloudinary;
    private readonly CloudinaryOptions _options;
    private readonly ILogger<CloudinaryService> _logger;

    public CloudinaryService(IOptions<CloudinaryOptions> options, ILogger<CloudinaryService> logger)
    {
        _options = options.Value;
        _logger = logger;

        var account = new Account(_options.CloudName, _options.ApiKey, _options.ApiSecret);
        _cloudinary = new CloudinaryDotNet.Cloudinary(account);
        _cloudinary.Api.Secure = true;
    }

    public async Task<CloudinaryUploadResult> UploadCardAssetAsync(
        Stream fileStream, string fileName, string deckId = "default")
    {
        var folder = $"arcana/decks/{deckId}/cards";

        var uploadParams = new ImageUploadParams
        {
            File = new FileDescription(fileName, fileStream),
            Folder = folder,
            UseFilenameAsDisplayName = true,
            UniqueFilename = true,
            Overwrite = false,
            Tags = new[] { "arcana", $"deck-{deckId}", "card" },
            Transformation = new Transformation()
                .Quality("auto")
                .FetchFormat("auto"),
        };

        _logger.LogInformation("Uploading {FileName} to {Folder}", fileName, folder);

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error != null)
        {
            _logger.LogError("Cloudinary upload error: {Error}", result.Error.Message);
            throw new InvalidOperationException($"Cloudinary upload failed: {result.Error.Message}");
        }

        _logger.LogInformation("Uploaded {PublicId} -> {SecureUrl}", result.PublicId, result.SecureUrl);

        return new CloudinaryUploadResult(
            PublicId: result.PublicId,
            SecureUrl: result.SecureUrl.ToString(),
            Width: result.Width,
            Height: result.Height,
            Bytes: result.Bytes,
            Format: result.Format
        );
    }

    public async Task<IReadOnlyList<CloudinaryUploadResult>> UploadCardAssetsBatchAsync(
        IEnumerable<(Stream stream, string fileName)> files, string deckId = "default")
    {
        var results = new List<CloudinaryUploadResult>();
        foreach (var (stream, fileName) in files)
        {
            try
            {
                var result = await UploadCardAssetAsync(stream, fileName, deckId);
                results.Add(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload {FileName}", fileName);
            }
        }
        return results;
    }

    public string GetCardAssetUrl(string publicId, CardImageFormat format = CardImageFormat.Svg, int? width = null)
    {
        var transformation = string.Empty;

        if (width.HasValue)
        {
            transformation = $"w_{width.Value},c_fill,f_auto,q_auto";
        }
        else if (format == CardImageFormat.Png)
        {
            transformation = "f_png,q_auto";
        }
        else if (format == CardImageFormat.Svg)
        {
            transformation = "f_svg,q_auto";
        }
        else
        {
            transformation = "f_auto,q_auto";
        }

        var url = $"https://res.cloudinary.com/{_options.CloudName}/image/upload/{transformation}/{publicId}";
        return url;
    }

    public async Task DeleteCardAssetAsync(string publicId)
    {
        var deleteParams = new DeleteResourcesParams { PublicIds = new[] { publicId } };
        await _cloudinary.DeleteResourcesAsync(deleteParams);
        _logger.LogInformation("Deleted {PublicId}", publicId);
    }
}
