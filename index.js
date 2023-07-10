const express= require('express');
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const port=process.env.PORT || 3030;

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly',
'https://www.googleapis.com/auth/gmail.send',
'https://www.googleapis.com/auth/gmail.compose',
'https://mail.google.com/'];


const app= express();

app.get('/', (req,res) => {
        res.send('<a href="auth/google">Login with Google</a>');

});

app.get('/auth/google', async (res,req) => {
        //To authenticate the user's credentials in the credentials.json file
        const auth = await authenticate({
                keyfilePath: path.join(__dirname, "credentials.json"),
                scopes: SCOPES,
        });
        //To create a mail client object
        const gmail = google.gmail({version: 'v1', auth});
        
        const label_name="VacationEmails";

        //the function now gets the list of unread emails in the inbox
        async function getUnreadEmails(auth){
                const gmail = google.gmail({version: 'v1', auth});
                const res = await gmail.users.messages.list({
                        userId: 'me',
                        labelIds: 'INBOX',
                        q: 'is:unread',
                });
                return res.data.messages||[];
        }
        //this function now creates a label named VacationEmails if it does not exist
        async function createLabel(auth){
                const gmail = google.gmail({version: 'v1', auth});
                try{
                        const res = await gmail.users.labels.create({
                                userId: 'me',
                                requestBody: {
                                        name: label_name,
                                        labelListVisibility: 'labelShow',
                                        messageListVisibility: 'show',
                                },
                        });
                        return res.data;
                }
                catch (error) {
                        if (error.code === 409) {
                          const response = await gmail.users.labels.list({
                            userId: "me",
                          });
                          const label = response.data.labels.find(
                            (label) => label.name === label_name
                          );
                          return label.id;
                        } else {
                          throw error;
                        }
                }
        }
        
        
        async function main() {
                const labelId = await createLabel(auth);
                //function to reply to the emails every 45-120 seconds
                setInterval(async () => {
                        const gmail = google.gmail({version: 'v1', auth});
                        const unreadEmails = await getUnreadEmails(auth);
                        if(unreadEmails && unreadEmails.length>0){
                                for(const unreadEmail in unreadEmails){
                                        const msgData= await gmail.users.messages.get({
                                        userId: 'me',
                                        id: unreadEmails[unreadEmail].id,
                                        });
                                        const email = msgData.data;
                                        const headers = msgData.data.payload.headers.some(
                                                (header) => header.name === "In-Reply-To"
                                        );
                                        if(!headers){
                                                const replyMsg={
                                                        userId: 'me',
                                                        requestBody: {
                                                            raw:Buffer.from(
                                                                `To: ${email.headers.find(
                                                                (header) => header.name === "From"              
                                                                ).value}||""
                                                                }\r\n` +
                                                                `Subject: Re: ${email.headers.find(
                                                                        (header) => header.name === "Subject"
                                                                )?.value || ""
                                                            }\r\n` +
                                                        `Content-Type: text/plain; charset="UTF-8"\r\n` +
                                                        `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `Hi, I'm currently on vacation. I will get back to you once I return.\r\n`
                                                        ).toString("base64"),
                                                        },
                                                }; 
                                                //send the reply message
                                                 await gmail.users.messages.send(replyMsg);
                                        }
                                   
                                   //move the email to the label created
                                   await gmail.users.messages.modify({
                                        userId: 'me',
                                        id: unreadEmails[unreadEmail].id,
                                        requestBody: {
                                                addLabelIds: [createLabel(auth)],
                                                removeLabelIds: ['INBOX'],
                                        },
                                    });

                                }        
                        }
                }, Math.floor(Math.random() * (120000 - 45000 + 1) + 45000));
        }        
        main();

        
        //res.send("Emails have been replied to and moved to the label VacationEmails");        

});

app.listen(port,(res,req)=>{
        console.log("Server is running on port "+port);
});

