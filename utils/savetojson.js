const fs = require('fs');
const file = 'bannedUsers.json';

// data is an array of numbers
function SaveToJson(data) {
  fs.writeFileSync(file, JSON.stringify(data));
  console.log('Saved to ' + file);
}

function LoadFromJson() {
  return JSON.parse(fs.readFileSync(file));
}