-- Services / Variables
local connectionManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/EXT/main/connections.lua", true))().new("Id")
local localPlayer = game:GetService("Players").LocalPlayer
local httpService = game:GetService("HttpService")

-- WebSocket Client
local ws = WebSocket.connect("ws://192.168.1.160:8080")

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
		local humanoid = character:WaitForChild("Humanoid")

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

			writefile(
				"scream.mp3",
				request({
					Url = "https://github.com/Grayy12/maxhubassets/raw/main/ScreamSfx.mp3",
					Method = "GET",
				}).Body
			)

			writefile("skibidi.webm", request({ Url = "https://github.com/Grayy12/maxhubassets/raw/main/skibidi.webm", Method = "GET" }).Body)

			local Converted = {
				["_ScreenGui"] = Instance.new("ScreenGui"),
				["_VideoFrame"] = Instance.new("VideoFrame"),
			}

			-- Properties:

			Converted["_ScreenGui"].ZIndexBehavior = Enum.ZIndexBehavior.Sibling
			Converted["_ScreenGui"].Parent = game:GetService("CoreGui")

			Converted["_VideoFrame"].AnchorPoint = Vector2.new(0.5, 0.5)
			Converted["_VideoFrame"].BackgroundColor3 = Color3.fromRGB(255, 255, 255)
			Converted["_VideoFrame"].BorderColor3 = Color3.fromRGB(0, 0, 0)
			Converted["_VideoFrame"].BorderSizePixel = 0
			Converted["_VideoFrame"].Position = UDim2.new(0.5, 0, 0.5, 0)
			Converted["_VideoFrame"].Size = UDim2.new(1, 0, 1, 0)
			Converted["_VideoFrame"].ZIndex = 9999
			Converted["_VideoFrame"].Parent = Converted["_ScreenGui"]
			Converted["_VideoFrame"].Video = getcustomasset("skibidi.webm", true)

			local s = Instance.new("Sound", workspace)
			s.SoundId = getcustomasset("scream.mp3", true)
			s.Volume = 30
			s:Play()
			Converted["_VideoFrame"].Looped = false
			Converted["_VideoFrame"]:Play()
			Converted["_VideoFrame"].Ended:Wait()

			Converted["_ScreenGui"]:Destroy()
			delfile("scream.mp3")
			delfile("skibidi.webm")

			return sendCmdResponse(true, "Success")
		end)()
	end,
}
-- Send user data so the server knows who we are
ws:Send(httpService:JSONEncode(userdata))

connectionManager:NewConnection(ws.OnMessage, function(msg)
	local data = httpService:JSONDecode(msg)

	if data.action == "run" then
		if commands[data.cmd] then
			pcall(commands[data.cmd], data.args)
		end
	end
end)

connectionManager:NewConnection(ws.OnClose, function()
	print("Closed")
end)
