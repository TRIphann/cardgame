// ITestRoomService — sub-interface of IRoomService bound to test rooms.
// Lets the DI container resolve the test-room-aware implementation without
// the production RoomService registration shadowing it.

using Arcana.Application.Abstractions;

namespace Arcana.Application.Services.TestRoom;

public interface ITestRoomService : IRoomService
{
}