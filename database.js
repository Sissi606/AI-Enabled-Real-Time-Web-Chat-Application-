const { MongoClient, ObjectId } = require('mongodb');	// require the mongodb driver

/**
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(mongoUrl).then((client) => {
			console.log(`[MongoClient] Connected to ${mongoUrl}/${dbName}`);
			resolve(client.db(dbName));
		}).catch((err) => {
			reject(err);
		});
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected
               .then((db) => db.collection("chatrooms").find({}).toArray());
}


Database.prototype.getRoom = function(room_id){
    return this.connected
                .then((db) => {
                    const collection = db.collection("chatrooms");
                    if (room_id instanceof ObjectId){ // ObjectId case
                        return collection.findOne({ _id: room_id }); //Find the document whose _id equals room_id
                    }
                    // String case
                    const idString = String(room_id);
                    // Try to convert the string to ObjectId, if it fails, we will search by string id
                    if (ObjectId.isValid(idString)) {
                        const strObjectId = new ObjectId(idString);
                        return collection.findOne({ _id: strObjectId }).then(doc => {
                            if (doc) {
                                return doc; // Found a document with the ObjectId
                            }
                            // If not found, try to find by string id
                            //database stored _id as a string instead of ObjectId.
                            return collection.findOne({ _id: idString }); 
                        })
                    }
                    // If the string is not a valid ObjectId, search by string id directly
                    return collection.findOne({ _id: idString });
                });
	
}

Database.prototype.addRoom = function(room){
	if (!room || !room.name ) {
        return Promise.reject(new Error("Invalid room object. 'name' is required."));
    }
    const doc = {
        name: room.name,
        image: room.image || 'assets/default-icon.png' // Use default image if not provided
    };

    if (room._id !== undefined){
        doc._id = room._id;
    }
    return this.connected.then((db) => {
        return db.collection("chatrooms").insertOne(doc);
    }).then(result => {
        const id = (doc._id !== undefined) ? doc._id : result.insertedId;
        return{
            _id: (typeof id === "string") ? id : id.toString(),
            name: doc.name,
            image: doc.image,
        }

    })
}

Database.prototype.addConversation = function(conversation){
    if (!conversation ||
         conversation.room_id === undefined || 
         conversation.timestamp === undefined ||
         conversation.messages === undefined) {
            return Promise.reject(
                new Error("Invalid conversation object. 'room_id', 'timestamp', and 'messages' are required.")
            ); 
         }
    const doc = {
        room_id: conversation.room_id,
        timestamp: conversation.timestamp,
        messages: conversation.messages
    };
    return this.connected.then((db) => {
        return db.collection("conversations").insertOne(doc);
    }).then((result) => {
        return {
            _id: result.insertedId, //Mongo document ID
            room_id: doc.room_id,
            timestamp: doc.timestamp,
            messages: doc.messages
        }

    })
}

Database.prototype.getLastConversation = function(room_id, before){
	if (before === undefined){
        before = Date.now();
    }
    return this.connected.then((db) => {
        return db.collection("conversations")
                .find({room_id : room_id, timestamp: { $lt: before } })
                .sort({ timestamp: -1 })
                .limit(1)
                .toArray()
                .then((arr) => arr[0]);
    });
}

Database.prototype.getUser = function(username){
    return this.connected.then((db) => {
        const collection = db.collection("users");
        return collection.findOne({ username: username });
    });
};

module.exports = Database;
