const express=require('express');
const path=require('path');
const app=express();
const port=process.env.PORT||3000;
app.use(express.static(path.join(__dirname)));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(port,'0.0.0.0',()=>console.log(`Legend Health app running on ${port}`));
