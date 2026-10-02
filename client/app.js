// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM(elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM(htmlString) {
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

function sanitizeText(text) {
    return String(text === undefined || text === null ? '' : text);
}

const MAX_UPLOAD_IMAGE_BYTES = 1024 * 1024; // 1MB client-side cap for image messages

function formatDisplayUsername(username) {
    const clean = sanitizeText(username).trim();
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function messageKey(message) {
    const username = sanitizeText(message && message.username);
    const text = sanitizeText(message && message.text);
    const image = sanitizeText(message && message.image);
    const imageCaption = sanitizeText(message && message.imageCaption);
    const imageKey = image ? `${image.slice(0, 48)}:${image.length}` : '';
    return `${username}\u0000${text}\u0000${imageKey}\u0000${imageCaption}`;
}

function mergeMessagesPreserveHistory(existingMessages, incomingMessages) {
    const existing = Array.isArray(existingMessages) ? existingMessages : [];
    const incoming = Array.isArray(incomingMessages) ? incomingMessages : [];
    const merged = existing.slice();
    const seen = new Set(merged.map(messageKey));

    incoming.forEach((msg) => {
        if (!msg) return;
        const key = messageKey(msg);
        if (seen.has(key)) return;
        merged.push(msg);
        seen.add(key);
    });

    return merged;
}

function createSearchResultElement(result) {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const header = document.createElement('div');
    header.className = 'search-result-header';
    header.textContent = `${sanitizeText(result && result.username).trim() || 'Unknown'}:`;
    item.appendChild(header);

    const text = sanitizeText(result && result.text).trim();
    if (text) {
        const textElem = document.createElement('div');
        textElem.className = 'search-result-text';
        textElem.textContent = text;
        item.appendChild(textElem);
    }

    const image = sanitizeText(result && result.image);
    if (image.startsWith('data:image/')) {
        const imageElem = document.createElement('img');
        imageElem.className = 'search-result-image';
        imageElem.src = image;
        imageElem.alt = 'Matched image message';
        imageElem.loading = 'lazy';
        item.appendChild(imageElem);
    }

    return item;
}

function createMessageElement(message, currentUsername) {
    const isMyMessage = message.username === currentUsername;
    const messageElem = document.createElement('div');
    messageElem.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;

    const userElem = document.createElement('span');
    userElem.className = 'message-user';
    userElem.textContent = `${formatDisplayUsername(message.username)}:`;

    const textElem = document.createElement('span');
    textElem.className = 'message-text';
    // Render message text through textContent so browser never interprets it as HTML.
    textElem.textContent = sanitizeText(message.text);
    const textValue = sanitizeText(message.text).trim();
    const imageValue = sanitizeText(message.image);

    messageElem.appendChild(userElem);
    if (textValue) {
        messageElem.appendChild(textElem);
    }

    if (imageValue.startsWith('data:image/')) {
        const imageElem = document.createElement('img');
        imageElem.className = 'message-image';
        imageElem.src = imageValue;
        imageElem.alt = 'Shared photo';
        imageElem.loading = 'lazy';
        messageElem.appendChild(imageElem);
    }
    return messageElem;
}

// example usage
var messageBox = createDOM(
    `<div>
        <span>Alice</span>
        <span>Hello World</span>
    </div>`
)

// placeholder HTML for the lobby page
const lobbyPage = `
          <div class="content">
            <ul class="room-list">
              <li><a href="#/chat">Welcome</a></li>
              <li><a href="#/chat">CPEN 320</a></li>
              <li><a href="#/chat">Off Topic</a></li>
            </ul>
            <div class="page-control">
              <input type="text">
              <button>Create Room</button>
            </div>
          </div>`;

// placeholder HTML for the chat page
const chatPage = `
  <div class="content chat-layout">
    <aside class="chat-sidebar">
      <h5 class="sidebar-title">Chat Rooms</h5>
      <ul class="chat-room-list"></ul>
    </aside>

    <section class="chat-main">
      <h4 class="room-name"></h4>

      <div class="message-list">
        <div class="message">
          <span class="message-user">Bob</span>
          <span class="message-text">Hello!</span>
        </div>

        <div class="message my-message">
          <span class="message-user">Alice</span>
          <span class="message-text">Hi!</span>
        </div>
      </div>

      <div class="page-control composer-panel">
          <textarea></textarea>
          <button class="send-btn">Send message</button>
      </div>
      <div class="attachment-panel">
          <div class="attachment-row">
              <label class="attach-btn">
                  <input type="file" class="photo-input" accept="image/*">
                  <span>Attach photo</span>
              </label>
              <span class="attachment-name">No photo attached</span>
              <button class="clear-photo-btn" type="button">Clear</button>
          </div>
      </div>
      <div class="ai-panel rewrite-panel">
          <div class="rewrite-controls">
              <select class = "rewrite-context">
                  <option value = "professor">Professor</option>
                  <option value = "ta">TA</option>
                  <option value = "teammate">Teammate</option>
                  <option value = "supervisor">Supervisor</option>
              </select>

              <select class="rewrite-tone">
                  <option value="professional">Professional</option>
                  <option value="polite">Polite</option>
                  <option value="formal">Formal</option>
                  <option value="concise">Concise</option>
                  <option value="casual">Casual</option>
                  <option value="friendly">Friendly</option>
              </select>

              <button class="ai-rewrite-btn">Rewrite ✨</button>
              <button class="ai-use-btn" type="button">Adopt the AI-rewritten message</button>
              <button class="ai-rewrite-clear-btn secondary-btn" type="button">Clear</button>
          </div>

          <div class="ai-preview"></div>
      </div>
     <div class="search-panel">
        <div class="search-controls">
            <input id="search-input" placeholder="Search messages..." />
            <button id="search-btn" type="button">Search history messages</button>
            <button id="search-back-btn" type="button" class="secondary-btn">Back</button>
        </div>
        <div id="search-results" class="search-results"></div>
    </div>
      <div class="ai-panel summary-panel">
          <div class="summary-controls">
              <button class="ai-summary-btn" type="button">Summarize recent messages</button>
              <button class="ai-summary-back-btn secondary-btn" type="button">Back</button>
          </div>
          <div class="ai-summary"></div>
      </div>
    </section>
  </div>`;

// placeholder HTML for the profile page
const profilePage = `
            <div class="content">
                <div class="profile-form">
                    <div class="form-field">
                        <label for="username">Username:</label>
                        <input type="text" id="username">
                    </div>
                    <div class="form-field">
                        <label for="password">Password:</label>
                        <input type="password" id="password">
                    </div>
                    <div class="form-field">
                        <label for="file">File:</label>
                        <input type="file" id="file">
                    </div>
                </div>
                <div class="page-control">
                    <button>Save Changes</button>
                </div>
            </div>`;

// placeholder user profile
var profile = {
    username: ""
};

// service for making API calls to the server
var Service = {
    origin: window.location.origin,

    getAllRooms: function () {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', Service.origin + '/chat');
            xhr.responseType = 'json';

            xhr.onload = function () {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else {
                    let message = (xhr.response && xhr.response.error) || xhr.statusText || xhr.responseText || "Server error";
                    reject(new Error(message));
                }
            };

            xhr.onerror = function (err) {
                reject(new Error("Network error" + (err && err.message ? (": " + err.message) : "")));
            };

            xhr.send();
        });
    },

    addRoom: function (data){
        return fetch(Service.origin + "/chat", {
            method: "POST",
            headers:{
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }).then((response) => {
           if (response.status == 200){
                return response.json();
           }

           return response.json().catch(() => response.text())
                                 .then((body) => {
                                     const msg = (body && (body.error || body.message)) ||
                                         (typeof body === "string" && body) ||
                                         res.statusText;
                                     throw new Error(msg);
                                 });
                                 
        });
    },

    getLastConversation: function(roomId, before){
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const queryBefore = (before === undefined || before === null) ? Date.now() : before;
            const url = `/chat/${encodeURIComponent(roomId)}/messages?before=${encodeURIComponent(queryBefore)}`;
            xhr.open('GET', Service.origin + url);
            xhr.responseType = 'json';

            xhr.onload = function () {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else if (xhr.status === 404) {
                    resolve(null);
                } else {
                    const message = (xhr.response && xhr.response.error) || xhr.statusText || "Server error";
                    reject(new Error(message));
                }
            };
            
            xhr.onerror = function () {
                reject(new Error("Network error"));
            };

            xhr.send();
        });
    },

    getProfile: function () {
        return fetch(Service.origin + '/profile')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch profile');
                }
                return response.json();
            });
    },

    summarizeMessages: function (messages) {
        return fetch(Service.origin + '/ai/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages })
        }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = (body && (body.error || body.detail)) || `Summarize failed (${response.status})`;
                throw new Error(message);
            }
            return body;
        });
    },

    captionImage: function (image, text) {
        return fetch(Service.origin + '/ai/caption-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: image, text: text || '' })
        }).then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = (body && (body.error || body.detail)) || `Caption failed (${response.status})`;
                throw new Error(message);
            }
            return body;
        });
    }

};

function* makeConversationLoader(room) {
    let before = room.timestamp; // load most recent conversation

    while (true) {
        room.canLoadConversation = false;

        const promise = Service.getLastConversation(room.id, before).then((conversation) => {
            if (!conversation) {
                return null;
            }

            before = conversation.timestamp; // update before to load the next conversation
            room.canLoadConversation = true;
            room.addConversation(conversation);
            return conversation;
            
        }).catch((err) => {
            room.canLoadConversation = true;
            throw err;
        });

        yield promise;

        if (!room.canLoadConversation) {
            return null;
        }
    }
}

// manages the messages in a chat room
class Room {
    constructor(id, name, image = "assets/everyone-icon.png", messages = []) {
        this.id = String(id);
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.canLoadConversation = true;
        this.getLastConversation = makeConversationLoader(this);
        this.timestamp = Date.now();
    }
    addMessage(username, text, image = '', imageCaption = '') {
        const safeText = sanitizeText(text);
        const safeImage = sanitizeText(image);
        const safeCaption = sanitizeText(imageCaption).trim();
        if (safeText.trim() === "" && !safeImage.startsWith('data:image/')) return;
        var message = {
            username: username,
            text: safeText
        };
        if (safeImage.startsWith('data:image/')) {
            message.image = safeImage;
            if (safeCaption) {
                message.imageCaption = safeCaption;
            }
        }
        this.messages.push(message);

        if (this.onNewMessage) {
            this.onNewMessage(message);
        }
    }

    addConversation(conversation){
        if (!conversation || !Array.isArray(conversation.messages)) return;
        this.messages = conversation.messages.concat(this.messages);

        // Notify ChatView that older messages were loaded
        if (typeof this.onFetchConversation === 'function') {
            this.onFetchConversation(conversation);
        }
    }
}

// manages the list of rooms in the lobby and their messages
class Lobby {
    constructor() {
        this.rooms = {};
    }
    getRoom(roomId) {
        return this.rooms[roomId];
    }
    addRoom(id, name, image, messages) {
        const newRoom = new Room(id, name, image, messages);
        this.rooms[newRoom.id] = newRoom;
        if (this.onNewRoom) {
            this.onNewRoom(newRoom);
        }
    }
}

// placeholder view for the lobby page
class LobbyView {
    constructor(lobby) {
        this.elem = createDOM(lobbyPage);
        this.listElem = this.elem.querySelector('.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');

        this.lobby = lobby;

        //draw initial list
        this.redrawList();

        //observe callbacks
        this.lobby.onNewRoom = (room) => {
            this.redrawList();
        };

        this.buttonElem.addEventListener("click", () => {
            var name = this.inputElem.value.trim();
            if (name === "") return;
            Service.addRoom(
                {
                    name: name,
                    image: "assets/everyone-icon.png"
                }).then((newRoom) => {
                // only add locally AFTER server succeeds
                const roomId = newRoom._id || newRoom.id;
                this.lobby.addRoom(
                    roomId,
                    newRoom.name,
                    newRoom.image,
                    []
                );
                //clear the text value of this.inputElem
                this.inputElem.value = "";
                }).catch((err) => {
                    console.error("Failed to create room:", err);
                });
        });
    }
}


// redraws the list of rooms in the lobby view
LobbyView.prototype.redrawList = function () {
    emptyDOM(this.listElem);
    for (const roomId in this.lobby.rooms) {
        var room = this.lobby.rooms[roomId];

        var liElem = document.createElement("li");
        var aElem = document.createElement("a");
        aElem.href = "#/chat/" + room.id;
        aElem.textContent = room.name;

        liElem.appendChild(aElem);
        this.listElem.appendChild(liElem);

    }
}

// placeholder view for the chat page
class ChatView {
    constructor(socket, lobby) {
        this.socket = socket;
        this.lobby = lobby;

        this.elem = createDOM(chatPage);
        this.titleElem = this.elem.querySelector('.room-name');
        this.chatElem = this.elem.querySelector('.message-list');
        this.roomListElem = this.elem.querySelector('.chat-room-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.photoInputElem = this.elem.querySelector('.photo-input');
        this.clearPhotoButtonElem = this.elem.querySelector('.clear-photo-btn');
        this.attachmentNameElem = this.elem.querySelector('.attachment-name');
        this.pendingImageData = '';
        this.pendingImageName = '';
        this.attachmentLoading = false;
        //added for AI features
        this.contextElem = this.elem.querySelector('.rewrite-context');
        this.toneElem = this.elem.querySelector('.rewrite-tone');
        this.rewriteButton = this.elem.querySelector('.ai-rewrite-btn');
        this.useButton = this.elem.querySelector('.ai-use-btn');
        this.rewriteClearButton = this.elem.querySelector('.ai-rewrite-clear-btn');
        this.previewElem = this.elem.querySelector('.ai-preview');
        this.summaryButton = this.elem.querySelector('.ai-summary-btn');
        this.summaryBackButton = this.elem.querySelector('.ai-summary-back-btn');
        this.summaryElem = this.elem.querySelector('.ai-summary');
        this.searchInputElem = this.elem.querySelector('#search-input');
        this.searchButtonElem = this.elem.querySelector('#search-btn');
        this.searchBackButtonElem = this.elem.querySelector('#search-back-btn');
        this.searchResultsElem = this.elem.querySelector('#search-results');


        this.buttonElem = this.elem.querySelector('.send-btn');
        this.room = null;
        this.chatElem.style.overflowY = "auto";
        this.chatElem.style.maxHeight = "400px";

        if (this.roomListElem) {
            this.roomListElem.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-room-id]');
                if (!button) return;
                const roomId = button.getAttribute('data-room-id');
                const targetRoom = this.lobby && this.lobby.getRoom(roomId);
                if (!targetRoom) return;
                this.setRoom(targetRoom);
                window.location.hash = `#/chat/${targetRoom.id}`;
            });
        }
        
        this.buttonElem.addEventListener("click", () => {
            this.sendMessage();
        });
        if (this.photoInputElem) {
            this.photoInputElem.addEventListener("change", () => {
                this.handleAttachmentSelection();
            });
        }
        if (this.clearPhotoButtonElem) {
            this.clearPhotoButtonElem.addEventListener("click", () => {
                this.clearAttachment();
            });
        }

        this.inputElem.addEventListener("keyup",(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault(); //prevent adding a new line
                this.sendMessage();
            }
        });

        this.chatElem.addEventListener("wheel", (event) => {
            if (!this.room) return;

            //if not at top, never load
            if (this.chatElem.scrollTop > 0) return;

            //only when scrolling up
            if (event.deltaY >= 0) return;

            //only if allowed
            if (!this.room.canLoadConversation) return;

            const {value} = this.room.getLastConversation.next();
            if (value && typeof value.catch === "function") {
                value.catch((err) => {
                    console.error("Failed to load conversation:", err);
                });
            }
        });

        this.rewriteButton.addEventListener("click", () => {
            const message = this.inputElem.value.trim();
            if (!message) return;

            const context = this.contextElem.value;
            const tone = this.toneElem.value;
            this.rewriteButton.disabled = true;
            this.rewriteButton.textContent = "Rewriting...";
            this.previewElem.textContent = "Rewriting message...";

            fetch('/ai/rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    context: context,
                    tone: tone
                })
            })
                .then(res => res.json())
                .then(data => {
                    this.previewElem.textContent = data.result || '';
                })
                .catch(err => {
                    console.error("rewrite failed:", err);
                    this.previewElem.textContent = "Rewrite failed. Please try again.";
                })
                .finally(() => {
                    this.rewriteButton.disabled = false;
                    this.rewriteButton.textContent = "Rewrite ✨";
                });
        });

        this.useButton.addEventListener("click", () => {
            const rewritten = this.previewElem.textContent.trim();
            if (!rewritten) return; 
            this.inputElem.value = rewritten;
        });
        if (this.rewriteClearButton) {
            this.rewriteClearButton.addEventListener("click", () => {
                this.clearRewriteState();
            });
        }

        this.summaryButton.addEventListener("click", () => {
            this.summarizeRoom();
        });
        if (this.summaryBackButton) {
            this.summaryBackButton.addEventListener("click", () => {
                this.clearSummaryState();
            });
        }
        if (this.searchButtonElem) {
            this.searchButtonElem.addEventListener("click", async () => {
                if (!this.room || !this.searchInputElem || !this.searchResultsElem) return;

                const query = this.searchInputElem.value;
                const roomId = this.room.id;

                const res = await fetch('/ai/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId, query })
                });

                const data = await res.json();

                this.searchResultsElem.innerHTML = '';

                data.results.forEach((r) => {
                    this.searchResultsElem.appendChild(createSearchResultElement(r));
                });
            });
        }
        if (this.searchBackButtonElem) {
            this.searchBackButtonElem.addEventListener("click", () => {
                this.clearSearchState();
            });
        }

        this.redrawRoomSidebar();
        this.clearAttachment();

    }
    loadRecentHistory(room){
        if (!room || !room.canLoadConversation) return;

        const targetMessageCount = 30;
        const maxBatches = 3;
        let batchesLoaded = 0;

        const loadNext = () => {
            if (!this.room || this.room.id !== room.id) return;
            if (!room.canLoadConversation) return;
            if (room.messages.length >= targetMessageCount) return;
            if (batchesLoaded >= maxBatches) return;

            const step = room.getLastConversation.next();
            if (!step || !step.value || typeof step.value.then !== 'function') return;

            batchesLoaded += 1;
            step.value
                .then((conversation) => {
                    if (!conversation) return;
                    loadNext();
                })
                .catch((err) => {
                    console.error("Failed to auto-load conversation history:", err);
                });
        };

        loadNext();
    }
    redrawRoomSidebar(){
        if (!this.roomListElem || !this.lobby) return;
        emptyDOM(this.roomListElem);

        Object.values(this.lobby.rooms).forEach((room) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-room-btn';
            button.setAttribute('data-room-id', room.id);
            button.textContent = room.name;

            if (this.room && this.room.id === room.id) {
                button.classList.add('active');
            }

            li.appendChild(button);
            this.roomListElem.appendChild(li);
        });
    }
    setAttachmentName(text){
        if (!this.attachmentNameElem) return;
        this.attachmentNameElem.textContent = text;
    }
    clearSearchState(){
        if (this.searchInputElem) {
            this.searchInputElem.value = "";
        }
        if (this.searchResultsElem) {
            this.searchResultsElem.innerHTML = "";
        }
    }
    clearRewriteState(){
        if (this.previewElem) {
            this.previewElem.textContent = "";
        }
    }
    clearSummaryState(){
        if (this.summaryElem) {
            this.summaryElem.textContent = "";
        }
    }
    clearAttachment(){
        this.pendingImageData = '';
        this.pendingImageName = '';
        this.attachmentLoading = false;
        if (this.photoInputElem) {
            this.photoInputElem.value = "";
        }
        this.setAttachmentName("No photo attached");
    }
    handleAttachmentSelection(){
        if (!this.photoInputElem || !this.photoInputElem.files || this.photoInputElem.files.length === 0) {
            this.clearAttachment();
            return;
        }

        const file = this.photoInputElem.files[0];
        if (!file.type.startsWith('image/')) {
            this.previewElem.textContent = "Only image uploads are supported.";
            this.clearAttachment();
            return;
        }
        if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
            this.previewElem.textContent = "Image too large. Please choose one under 1MB.";
            this.clearAttachment();
            return;
        }

        this.attachmentLoading = true;
        this.setAttachmentName(`Loading: ${file.name}`);

        const reader = new FileReader();
        reader.onload = () => {
            const imageData = String(reader.result || '');
            if (!imageData.startsWith('data:image/')) {
                this.previewElem.textContent = "Invalid image data.";
                this.clearAttachment();
                return;
            }
            this.pendingImageData = imageData;
            this.pendingImageName = file.name;
            this.attachmentLoading = false;
            this.setAttachmentName(`Attached: ${file.name}`);
        };
        reader.onerror = () => {
            this.previewElem.textContent = "Failed to read image file.";
            this.clearAttachment();
        };

        reader.readAsDataURL(file);
    }
    async sendMessage(){
        if (!this.room) {
            if (this.previewElem) {
                this.previewElem.textContent = "Select a room from Home first.";
            }
            return;
        }
        

        if (this.attachmentLoading) {
            this.previewElem.textContent = "Please wait for the image attachment to finish loading.";
            return;
        }


        const text = this.inputElem.value;
        const imageData = this.pendingImageData || '';
        if (text.trim() === "" && !imageData) return;

        this.buttonElem.disabled = true;
        this.buttonElem.textContent = "Sending...";

        try {
            this.room.addMessage(profile.username, text, imageData, '');
            const msg = {
                roomId: this.room.id,
                text: text,
                image: imageData,
                imageCaption: ''
            };
            this.socket.send(JSON.stringify(msg));

            this.inputElem.value = "";
            this.clearAttachment();
        } finally {
            this.buttonElem.disabled = false;
            this.buttonElem.textContent = "Send message";
        }
    }
    summarizeRoom(){
        if (!this.room) return;

        const summaryPayload = this.room.messages
            .map((message) => {
                const username = sanitizeText(message.username).trim() || 'Unknown';
                const text = sanitizeText(message.text).trim();
                const image = sanitizeText(message.image);
                const hasImage = image.startsWith('data:image/');
                if (!text && !hasImage) return null;
                return {
                    username: username,
                    text: text,
                    image: hasImage ? image : '',
                    imageCaption: sanitizeText(message.imageCaption).trim()
                };
            })
            .filter(Boolean);

        if (summaryPayload.length === 0) {
            this.summaryElem.textContent = "No messages to summarize yet.";
            return;
        }

        this.summaryButton.disabled = true;
        this.summaryButton.textContent = "Summarizing...";
        this.summaryElem.textContent = "Generating summary...";

        Service.summarizeMessages(summaryPayload)
            .then((data) => {
                this.summaryElem.textContent = data.result || "No summary returned.";
            })
            .catch((err) => {
                this.summaryElem.textContent = `Summary failed: ${err.message}`;
            })
            .finally(() => {
                this.summaryButton.disabled = false;
                this.summaryButton.textContent = "Summarize recent messages";
            });
    }
    setRoom(room){
        const previousRoom = this.room;
        if (previousRoom) {
            previousRoom.onNewMessage = null;
            previousRoom.onFetchConversation = null;
        }

        this.room = room || null;
        this.titleElem.textContent = this.room ? this.room.name : "Select a chat room";
        emptyDOM(this.chatElem);
        this.clearRewriteState();
        this.clearSummaryState();
        this.clearSearchState();
        this.clearAttachment();

        this.redrawRoomSidebar();

        if (!this.room) {
            return;
        }

        this.room.messages.forEach((message) => {
            const messageElem = createMessageElement(message, profile.username);
            this.chatElem.appendChild(messageElem);
        });

        this.room.onNewMessage = (message) => {
            const messageElem = createMessageElement(message, profile.username);
            this.chatElem.appendChild(messageElem);
        };

        this.room.onFetchConversation = (conversation) => {
            if (!conversation || !Array.isArray(conversation.messages) || conversation.messages.length === 0) return;
            if (!this.room || this.room.id !== conversation.room_id) return;

            const heightBefore = this.chatElem.scrollHeight;
            const fragment = document.createDocumentFragment();

            conversation.messages.forEach((message) => {
                const messageElem = createMessageElement(message, profile.username);
                fragment.appendChild(messageElem);
            });

            this.chatElem.insertBefore(fragment, this.chatElem.firstChild);
            const heightAfter = this.chatElem.scrollHeight;
            this.chatElem.scrollTop = heightAfter - heightBefore;
        };

        this.loadRecentHistory(this.room);
    }
}

// placeholder view for the profile page
class ProfileView {
    constructor() {
        this.elem = createDOM(profilePage);
    }
}

function main() {
    var lobby = new Lobby();

    // Match the current page host so session cookies are sent to the broker.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `${wsProtocol}://${wsHost}:8000`;
    var socket = new WebSocket(wsUrl);

    var lobbyView = new LobbyView(lobby);
    var chatView = new ChatView(socket, lobby);
    var profileView = new ProfileView();

    Service.getProfile()
        .then(userProfile => {
            profile.username = userProfile.username;
            renderRoute();
            refreshLobby();
        })
        .catch(err => {
            console.error('Failed to fetch profile:', err);
        });

    // periodically refresh the lobby to get new rooms and messages
    function refreshLobby() {
        Service.getAllRooms().then((rooms) => {
            rooms.forEach((roomData) => {
                const roomId = String(roomData._id || roomData.id);
                const room = lobby.getRoom(roomId);
                if (room) {
                    room.name = roomData.name;
                    room.image = roomData.image;
                    room.messages = mergeMessagesPreserveHistory(room.messages, roomData.messages);
                }
                else {
                    lobby.addRoom(roomId, roomData.name, roomData.image, roomData.messages);
                }
            });
            chatView.redrawRoomSidebar();
        }).catch((err) => {
            console.error("Failed to fetch rooms:", err);
        });
    }

    // render the correct view based on the URL hash
    function renderRoute() {
        const path_parts = window.location.hash.replace("#/", "").split("/");
        const pageView = document.querySelector('#page-view');
        emptyDOM(pageView);


        if (path_parts[0] === "") {
            pageView.appendChild(lobbyView.elem);
        }
        else if (path_parts[0] === "chat") {
            const roomId = path_parts[1];
            const room = lobby.getRoom(roomId);
            chatView.setRoom(room || null);
            pageView.appendChild(chatView.elem);
        }
        else if (path_parts[0] === "profile") {
            pageView.appendChild(profileView.elem);
        }

    }
    // render the correct view based on the URL hash and re-render when the hash changes
    window.addEventListener('popstate', renderRoute);

    // periodically refresh the lobby to get new rooms and messages
    const timer = setInterval(refreshLobby, 5000);


    //Attach message event handler on the WebSocket instance
    socket.addEventListener("message", (event)=>{
        const msg = JSON.parse(event.data);

        const room = lobby.getRoom(msg.roomId);
        if (room){
            room.addMessage(msg.username, msg.text, msg.image, msg.imageCaption);
        }
    });

    cpen322.export(main, {
        renderRoute,
        refreshLobby,
        lobby,
        lobbyView,
        chatView,
        profileView,
        timer,
        socket
    });
}


window.addEventListener('load', main);
