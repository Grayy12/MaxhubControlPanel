async function getLuarmorUser(key) {
  try {
    let response;

    response = await fetch(
      `https://api.luarmor.net/v3/projects/13169b50586ef3527b48a0ab2999e880/users?user_key=${key}`,
      {
        headers: {
          Authorization: process.env.LUARMOR_TOKEN,
        },
      }
    );

    if (response.ok) {
      const users = (await response.json()).users;
      return users.length > 0 ? users[0] : null;
    }
  } catch (e) {
    console.error("Get luarmor user failed:", e);
  }
}

module.exports = getLuarmorUser;
