const {AuthenticationError} = require('graphql-yoga');

const jwt = require('jsonwebtoken');
const {SECRET_KEY} = require('../config');

module.exports = (context) => {
    //  context = { ...headers}
        
        const authHeader = context.req.request.headers.authorization;
        if(authHeader) {
            // Bearer
            const token = authHeader.split('Bearer ')[1];
            if(token){
                try{
                    const user = jwt.verify(token, SECRET_KEY);
                    return user;
                } catch(err){
                     throw new Error('Invalid/Expired token');
                }
            }
            throw new Error('Authentication token must be \'Bearer [token]');
        }
        throw new Error('Authorisation header must be provided');
};