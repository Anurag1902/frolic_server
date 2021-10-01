const { GraphQLServer, PubSub} = require("graphql-yoga");
const {MONGODB} = require('./config.js');
const mongoose = require('mongoose');
var { GraphQLError } = require('graphql');

// Machine learning .. using tensorflow
require('@tensorflow/tfjs');
const toxicity = require('@tensorflow-models/toxicity');
// Posts 
const Post = require('./models/Post');
const Message = require('./models/Message');

// user 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {validateRegisterInput, validateLoginInput} = require('./util/validators')
const {SECRET_KEY} = require('./config');
const User = require('./models/User');
const checkAuth = require('./util/check-auth');
function generateToken(user){
    return jwt.sign({
        id: user.id,
        email: user.email,
        username: user.username,
    }, SECRET_KEY, 
    {expiresIn: '1h'}
    );
}

const messages = [];

const typeDefs = `
    type Post{
        id:ID!
        body: String!
        createdAt: String!
        username: String!
        comments: [Comment]!
        likes: [Like]!
        likeCount: Int!
        commentCount: Int!
    }
    type Comment{
        id: ID! 
        createdAt: String!
        username: String!
        body: String!
   }
   type Like{
       id: ID!
       createdAt: String!
       username: String!
   }
    type Message {
        id: ID!
        user: String!
        content: String!
        createdAt: String!
    }
    type User{
        id:ID!
        email: String!
        token: String!
        username: String!
        createdAt: String!
        }
    input RegisterInput{
            username: String!
            password: String!
            confirmPassword: String!
            email: String!
        }
        type Query {
            getPosts: [Post]
            getMessages: [Message]
            getPost(postId: ID!): Post
            messages: [Message!]
        }
    type Mutation {
        register(registerInput: RegisterInput) : User!   
        login(username: String!, password: String!) : User!
        createPost(body: String!) : Post!
        deletePost(postId: ID!): String!
        createComment(postId: String!, body: String!) : Post!
        deleteComment(postId: ID!, commentId: ID!): Post!
        likePost(postId: ID!): Post!
        postMessage(user: String!, content: String!): ID!
        deleteMessage(id: ID!, user: String!): String!
    }
    type Subscription {
        messages: [Message!]
    }
`;

const subscribers = [];
const onMessagesUpdates = (fn) => subscribers.push(fn);

const resolvers = {
    Post:{
        likeCount: (parent)=> parent.likes.length,
        commentCount: (parent) => parent.comments.length
    },
  Query: {
   async messages (){
        // const da =await Message.find().sort({createdAt:-1});
        // da.map((daa)=> {
        //     messages.push({
        //         id:daa.id,
        //         user:daa.username,
        //         content: daa.content,
        //         creaeted: daa.createdAt,
        //     })
        // })
        return messages;
        
    },
    async getPosts(){
        try{
           const posts = await Post.find().sort({createdAt: -1});
           return posts;
       } catch (err) {
           throw new Error(err);
       }
   },
   async getPost(_,  { postId }){
       try {
           const post = await Post.findById(postId);
           if(post){
               return post;
           } else { 
               throw new Error('Post not found');
           }
       } catch(err) {
           throw new Error('Post not found');
       }
      },
      async getMessages() {
        const allmessages = await Message.find().sort({createdAt:-1});
        const data = [];
        allmessages.forEach((da)=> {
                data.push({
                    id: da.id,
                    user: da.username,
                    content:da.content,
                });
            });
            // console.log(data);
            return data;
        // return data;
      }
  },
  Mutation: {
     async postMessage(_, { user, content },context) {
        const threshold = 0.9;
        toxicity.load(threshold).then(model => {
            const sentences = [content];
          
            model.classify(sentences).then(predictions => {
              console.log(predictions.map((pop) => {
                    pop.results.map((popo)=> {
                        if(popo.match===null || popo.match===true){
                      console.log('warning')
                  }
                    })
                 
              }));
            });
          });
      const users = checkAuth(context);
      if(users.username===user){
      const newMessage = new Message({
          username: users.username,
          content,
          createdAt: new Date().toISOString(),
      });
      const res = await newMessage.save();
      messages.push({
        id: res.id,
        user: users.username,
        content,
        createdAt: new Date().toISOString(),
      });
      subscribers.forEach((fn) => fn());
      return res.id;
    } else{
        throw new Error("Authorization Required")
    }
    },
    async deleteMessage(_, {id, user},context){
      var c = 1;
      const users = checkAuth(context);
      const response = await Message.findById(id);
      var mess = "";
      if(response){
      if(users.username ===user){
          await response.delete();
          mess = 'Post deleted successfully';        
      }
      else {throw new Error("Authorization Required")}
    } else {throw new Error("Message not found!!")}
      messages.forEach((fn) => {
        if(fn.id==id && fn.user==user){
          // remove object
          const removeIndex = messages.findIndex( item => item.id === fn.id );
          // remove object
          messages.splice( removeIndex, 1 );
         c = 0 ;
         subscribers.forEach((fn) => fn());
          // return 'Message deleted successfully!';
      }      
      });
      if(c==1){
      return mess ='Error!'} else { 
        return mess
        }
    },
    async login(_, {username, password}){
        const {errors, valid} = validateLoginInput(username, password);
        const user = await User.findOne({username});
        // console.log("11",errors)
        if(!valid){
            throw new Error([errors.username, errors.password]);
        }

        if(!user){ 
            errors.general = 'Users not found';
            // console.log(errors)
            throw new Error(errors.general);
        }
        
        const match = await bcrypt.compare(password, user.password);
        if(!match){
            errors.general = 'Users not found';
            throw new Error(errors.general);
        }

        const token = generateToken(user);
        return {
            ...user._doc,
            id:user._id,
            token
        };
    },
    async register(
        _,
        {
           registerInput : {username, email, password, confirmPassword} // getting from type defs line 17 - 21
        },) // info here is the meta data 
        {
        // Validate user data
        const { valid, errors } = validateRegisterInput(username, email, password, confirmPassword);
        const user = await User.findOne({ username });
        if(user){
            errors.username = `Error!! '${username}' is already taken`;
            throw new Error (errors.username)
        }
        const checkEmail = await User.findOne({ email });
        if(checkEmail){
            errors.email = `Error!! '${email}' is already taken`;
            throw new Error ([errors.username,errors.email])
        }
        // make sure no duplicate email addresses
        if(!valid){
            throw new Error([errors.username,errors.email,errors.password,errors.confirmPassword]);
        }
        // make sure no duplicate users
        
        

        // hashing passwords
         password = await bcrypt.hash(password,12);
         
         const newUser = new User({
               email, 
               username,
               password, 
               createdAt: new Date().toISOString(), 
         });

         const res = await newUser.save();

         const token = generateToken(res);

         return {
             ...res._doc,
             id:res._id,
             token
         };
    },
    async createPost(_,{ body }, context){
        const user = checkAuth(context);

        if(body.trim()===''){
            throw new Error('Post body cannot be empty!!');
        }

        const newPost = new Post({ 
            body, 
            user: user.id,
            username: user.username,
            createdAt: new Date().toISOString()
        });

        const post = await newPost.save();
        return post;
     },
     async deletePost(_, {postId}, context){ 
         const user = checkAuth(context);

         try {
             const post = await Post.findById(postId);
             if(user.username=== post.username){
                 await post.delete();
                 return 'Post deleted successfully!';
             } else {
                throw new Error('Action not allowed');
             }
         } catch (error) {
             throw new Error(error);
         }
     },
     async likePost(_, { postId }, context){
        const { username } = checkAuth(context);

        const post = await Post.findById(postId);
         
         if(post){
             if(post.likes.find(like=> like.username ===username)){
                //  Post already liked .. option to unlike
                post.likes = post.likes.filter(like => like.username!== username);
                await post.save();
             } else {
                 post.likes.push({
                     username,
                     createdAt: new Date().toISOString()
                 });
             }

             await post.save();
             return post;
         } else {
             throw new Error('Post not found');
     }},
     createComment: async (_, { postId, body }, context) => {
        const { username } = checkAuth(context);
        if(body.trim()===''){
            throw new Error('Empty comment', {
                error:{
                    body: 'Comment body cannot be empty!!'
                }
            });      
        }

        const post = await Post.findById(postId);

        if(post) {
            post.comments.unshift({
                body,
                username,
                createdAt: new Date().toISOString(),
            });
            await post.save();
            return post;
        } else throw new Error('Post not found');
    },
    async deleteComment(_, {postId, commentId}, context){
        const {username} = checkAuth(context);

        const post = await Post.findById(postId);

        if(post){
            const commentIndex = post.comments.findIndex(c => c.id ===commentId);
            if(commentIndex === -1){
                throw new Error('Comment not found'); 
            }
            if(post.comments[commentIndex].username ===username){
                post.comments.splice(commentIndex, 1);
                await post.save();
                return post;
            } else {
                throw new Error('Action not allowed'); // another user trying to delete other account's post
            }
        } else {
            throw new Error('Post not found');  // post is not founf in the db
        }
    },
  },
  Subscription: {
    messages: {
      async subscribe(parent, args, { pubsub }){
        const channel = Math.random().toString(36).slice(2, 15);
        onMessagesUpdates(() => pubsub.publish(channel, { messages }));
        setTimeout(() => pubsub.publish(channel, { messages }), 0);
        return pubsub.asyncIterator(channel);
      },
    },
  },
};

const pubsub = new PubSub();
const server = new GraphQLServer({ typeDefs, resolvers, context:(req) => ({ req ,pubsub })});
mongoose
    .connect(MONGODB, { useNewUrlParser: true})
    .then(()=>{
        console.log('connected to MongoDB');
        return server.start({port: 4000});
    })
    .then((res)=> {
        console.log(`Server running at ${res.address().port}`);
    })
    .catch(err => {
        console.log(err)
    })