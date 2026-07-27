using Arcana.Infrastructure.Cloudinary;
using Microsoft.AspNetCore.Mvc;

namespace Arcana.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CardsController : ControllerBase
{
    private readonly ICloudinaryService _cloudinary;
    private readonly ILogger<CardsController> _logger;

    public CardsController(ICloudinaryService cloudinary, ILogger<CardsController> logger)
    {
        _cloudinary = cloudinary;
        _logger = logger;
    }

    /// <summary>
    /// Upload 1 card asset (SVG/PNG)
    /// POST /api/cards/upload
    /// Form: file + optional deckId (default="default")
    /// </summary>
    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
    public async Task<IActionResult> UploadCard(IFormFile file, [FromQuery] string deckId = "default")
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file provided.");

        var allowedExtensions = new[] { ".svg", ".png", ".jpg", ".jpeg", ".webp" };
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(ext))
            return BadRequest($"Unsupported format: {ext}. Allowed: {string.Join(", ", allowedExtensions)}");

        await using var stream = file.OpenReadStream();
        var result = await _cloudinary.UploadCardAssetAsync(stream, file.FileName, deckId);

        _logger.LogInformation("Card uploaded: {PublicId}", result.PublicId);

        return Ok(new
        {
            publicId = result.PublicId,
            url = result.SecureUrl,
            width = result.Width,
            height = result.Height,
            size = result.Bytes,
            format = result.Format,
        });
    }

    /// <summary>
    /// Batch upload multiple card assets
    /// POST /api/cards/upload-batch
    /// Form: files (IFormFileCollection)
    /// </summary>
    [HttpPost("upload-batch")]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50 MB
    public async Task<IActionResult> UploadBatch(IFormFileCollection files, [FromQuery] string deckId = "default")
    {
        if (files == null || files.Count == 0)
            return BadRequest("No files provided.");

        var filesToUpload = files
            .Select(f => (stream: (Stream)f.OpenReadStream(), fileName: f.FileName))
            .ToList();

        var results = await _cloudinary.UploadCardAssetsBatchAsync(filesToUpload, deckId);

        return Ok(new
        {
            total = files.Count,
            uploaded = results.Count,
            cards = results.Select(r => new
            {
                publicId = r.PublicId,
                url = r.SecureUrl,
                width = r.Width,
                height = r.Height,
                size = r.Bytes,
                format = r.Format,
            })
        });
    }

    /// <summary>
    /// Get card URL with optional resize transformation
    /// GET /api/cards/url?publicId=arcana/decks/default/cards/bomb&width=140&format=svg
    /// </summary>
    [HttpGet("url")]
    public IActionResult GetCardUrl(
        [FromQuery] string publicId,
        [FromQuery] int? width = null,
        [FromQuery] string format = "auto")
    {
        if (string.IsNullOrWhiteSpace(publicId))
            return BadRequest("publicId is required.");

        var imgFormat = format.ToLowerInvariant() switch
        {
            "svg" => CardImageFormat.Svg,
            "png" => CardImageFormat.Png,
            _ => CardImageFormat.Auto,
        };

        var url = _cloudinary.GetCardAssetUrl(publicId, imgFormat, width);
        return Ok(new { url, publicId });
    }

    /// <summary>
    /// Delete a card asset
    /// DELETE /api/cards/{publicId}
    /// </summary>
    [HttpDelete("{publicId}")]
    public async Task<IActionResult> DeleteCard(string publicId)
    {
        await _cloudinary.DeleteCardAssetAsync(publicId);
        return NoContent();
    }
}
