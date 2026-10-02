const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
		const token = crypto.randomBytes(32).toString('hex');
        
        // Store session state server-side and send only the opaque token to the client.
        sessions[token] = {
            username: username,
            createdAt: Date.now(),
            expiresAt: Date.now() + maxAge
        };

        response.cookie("cpen322-session", token, {maxAge: maxAge});

        setTimeout(() => {
            delete sessions[token];
        }, maxAge);
	};

	this.deleteSession = (request) => {
		// Remove both the in-memory session entry and the request metadata added by middleware.
		if (request && request.session) {
			delete sessions[request.session];
		}
		if (request) {
			delete request.username;
			delete request.session;
		}
	};

	this.middleware = (request, response, next) => {
		const cookie_header = request.headers.cookie;
        if (!cookie_header){
            return next(new SessionError("No cookie header found"));
        }
        const cookies = {};
        cookie_header.split(';').forEach(pair => {
            const parts = pair.trim().split('=');
            const name = parts[0];
            const value = parts.slice(1).join('=');
            cookies[name] = value;
        });

        const token = cookies["cpen322-session"];
        if (!token || !(token in sessions)) {
            return next(new SessionError('Invalid session token'));
        }

        // Expose the authenticated user/session to downstream route handlers.
        request.username = sessions[token].username;
        request.session = token;
        next();
	};

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;
