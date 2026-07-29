using Arcana.Domain.Common;

namespace Arcana.Application.Abstractions;

public interface IInvitationCodeGenerator
{
    string Generate();
    bool IsValid(string code);
}

public class InvitationCodeGenerator : IInvitationCodeGenerator
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int Length = 6;

    public string Generate()
    {
        var bytes = new byte[Length];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        var chars = new char[Length];
        for (var i = 0; i < Length; i++)
        {
            chars[i] = Alphabet[bytes[i] % Alphabet.Length];
        }
        return new string(chars);
    }

    public bool IsValid(string code)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length != Length) return false;
        return code.All(c => Alphabet.Contains(c));
    }
}

public class InvalidInvitationCodeException : DomainException
{
    public InvalidInvitationCodeException()
        : base("invalid_code", "Mã phòng không hợp lệ. Mã phòng gồm 6 ký tự.") { }
}
