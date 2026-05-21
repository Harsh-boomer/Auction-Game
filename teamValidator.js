/**
 * Checks if a requested team is already taken by another user in the room.
 * @param {Object} room - The room object containing users.
 * @param {String} requestedTeam - The team code (e.g., 'IND', 'AUS') to check.
 * @returns {Boolean} - Returns true if the team is available, false if it's already taken.
 */
function isTeamAvailable(room, requestedTeam) {
    if (!room || !room.users) {
        return true;
    }

    // Check if any existing user in the room has the requested team
    const usersArray = Object.values(room.users);
    for (const user of usersArray) {
        if (user.team === requestedTeam) {
            return false; // Team is already taken
        }
    }

    return true; // Team is available
}

module.exports = {
    isTeamAvailable
};
