using Arcana.Application.Abstractions;

namespace Arcana.UnitTests.Application;

/// <summary>
/// Unit tests for <see cref="InvitationCodeGenerator"/> — the room-code
/// generator used by the lobby join flow.
///
/// The alphabet deliberately excludes I/O/0/1 so codes can be read aloud
/// without ambiguity. These tests lock that behaviour in.
/// </summary>
public class InvitationCodeGeneratorTests
{
    private readonly InvitationCodeGenerator _generator = new();

    [Fact]
    public void Generate_ReturnsCodeOfExactlySixCharacters()
    {
        var code = _generator.Generate();

        Assert.Equal(6, code.Length);
    }

    [Fact]
    public void Generate_OnlyUsesCharactersFromTheSafeAlphabet()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        for (var i = 0; i < 200; i++)
        {
            var code = _generator.Generate();

            Assert.All(code, c => Assert.Contains(c, alphabet));
        }
    }

    [Fact]
    public void Generate_NeverProducesAmbiguousCharacters()
    {
        // I, O, 0 and 1 are excluded on purpose.
        for (var i = 0; i < 200; i++)
        {
            var code = _generator.Generate();

            Assert.DoesNotContain('I', code);
            Assert.DoesNotContain('O', code);
            Assert.DoesNotContain('0', code);
            Assert.DoesNotContain('1', code);
        }
    }

    [Fact]
    public void Generate_ProducesDifferentCodesAcrossCalls()
    {
        var codes = new HashSet<string>();
        for (var i = 0; i < 100; i++) codes.Add(_generator.Generate());

        // A collision in 100 draws from a 32^6 space is essentially impossible.
        Assert.True(codes.Count > 95, $"expected mostly unique codes, got {codes.Count}/100 unique");
    }

    [Fact]
    public void IsValid_ReturnsTrue_ForAGeneratedCode()
    {
        var code = _generator.Generate();

        Assert.True(_generator.IsValid(code));
    }

    [Theory]
    [InlineData("ABC234")]
    [InlineData("ZZZZZZ")]
    [InlineData("AAAAAA")]
    public void IsValid_ReturnsTrue_ForWellFormedCodes(string code)
    {
        Assert.True(_generator.IsValid(code));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void IsValid_ReturnsFalse_ForNullOrBlank(string? code)
    {
        Assert.False(_generator.IsValid(code!));
    }

    [Theory]
    [InlineData("ABC23")]     // too short
    [InlineData("ABC2345")]   // too long
    public void IsValid_ReturnsFalse_ForWrongLength(string code)
    {
        Assert.False(_generator.IsValid(code));
    }

    [Theory]
    [InlineData("ABC23I")]    // 'I' is not in the alphabet
    [InlineData("ABC23O")]
    [InlineData("ABC230")]
    [InlineData("ABC231")]
    [InlineData("ABC23!")]    // punctuation
    [InlineData("ABC 23")]   // space
    [InlineData("abc234")]    // lowercase
    public void IsValid_ReturnsFalse_ForCharactersOutsideTheAlphabet(string code)
    {
        Assert.False(_generator.IsValid(code));
    }

    [Fact]
    public void InvalidInvitationCodeException_CarriesTheExpectedDomainCode()
    {
        var ex = new InvalidInvitationCodeException();

        Assert.Equal("invalid_code", ex.Code);
        Assert.Contains("6", ex.Message);
    }
}
