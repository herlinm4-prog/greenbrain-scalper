"""GreenBrain Windows MT5 bridge. Demo accounts only; MT5 credentials stay in the terminal."""
from __future__ import annotations
import os, secrets, sqlite3, time
from contextlib import asynccontextmanager
from typing import Literal
import MetaTrader5 as mt5
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

TOKEN=os.environ["GREENBRAIN_BRIDGE_TOKEN"]
LOGIN=int(os.environ["GREENBRAIN_DEMO_LOGIN"])
SERVER=os.environ["GREENBRAIN_DEMO_SERVER"]
MAGIC=int(os.getenv("GREENBRAIN_MAGIC_NUMBER","260824"))
SYMBOLS={x.strip() for x in os.getenv("GREENBRAIN_ALLOWED_SYMBOLS","EURUSD,GBPUSD,USDJPY").split(",") if x.strip()}
MAX_LOTS=float(os.getenv("GREENBRAIN_MAX_LOTS","0.10"))
MAX_DEVIATION=int(os.getenv("GREENBRAIN_MAX_DEVIATION_POINTS","20"))
DB=sqlite3.connect("greenbrain_bridge.db",check_same_thread=False)
DB.execute("CREATE TABLE IF NOT EXISTS submitted_orders(id TEXT PRIMARY KEY, ticket INTEGER, created_ms INTEGER NOT NULL)")
DB.commit()

class Order(BaseModel):
    id:str=Field(min_length=3,max_length=100)
    signalId:str=Field(min_length=3,max_length=100)
    symbol:str
    side:Literal["buy","sell"]
    volumeLots:float=Field(gt=0)
    requestedPrice:float=Field(gt=0)
    stopLoss:float=Field(gt=0)
    takeProfit:float=Field(gt=0)
    createdAtMs:int
    magicNumber:int

def auth(authorization:str=Header(default="")):
    expected=f"Bearer {TOKEN}"
    if not secrets.compare_digest(authorization,expected): raise HTTPException(401,"Unauthorized")

def account():
    info=mt5.account_info()
    if info is None: raise HTTPException(503,f"MT5 account unavailable: {mt5.last_error()}")
    if info.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO: raise HTTPException(403,"Non-demo MT5 account blocked")
    if int(info.login)!=LOGIN or info.server!=SERVER: raise HTTPException(403,"MT5 account/server not allowlisted")
    return info

def symbol_info(name:str):
    if name not in SYMBOLS: raise HTTPException(403,"Symbol not allowlisted")
    if not mt5.symbol_select(name,True): raise HTTPException(422,"Symbol unavailable")
    info=mt5.symbol_info(name)
    if info is None: raise HTTPException(422,"Symbol metadata unavailable")
    return info

def normalized_volume(value:float,info):
    if value>MAX_LOTS: raise HTTPException(422,"Volume exceeds bridge maximum")
    steps=int((value+1e-12)/info.volume_step)
    volume=round(steps*info.volume_step,8)
    if volume<info.volume_min or volume>info.volume_max: raise HTTPException(422,"Volume violates broker limits")
    return volume

def request_for(order:Order, filling:int):
    info=symbol_info(order.symbol); tick=mt5.symbol_info_tick(order.symbol)
    if tick is None: raise HTTPException(503,"Tick unavailable")
    if order.magicNumber!=MAGIC: raise HTTPException(403,"Magic number rejected")
    if order.side=="buy" and not(order.stopLoss<tick.ask<order.takeProfit): raise HTTPException(422,"Invalid buy protection levels")
    if order.side=="sell" and not(order.takeProfit<tick.bid<order.stopLoss): raise HTTPException(422,"Invalid sell protection levels")
    return {"action":mt5.TRADE_ACTION_DEAL,"symbol":order.symbol,"volume":normalized_volume(order.volumeLots,info),"type":mt5.ORDER_TYPE_BUY if order.side=="buy" else mt5.ORDER_TYPE_SELL,"price":tick.ask if order.side=="buy" else tick.bid,"sl":order.stopLoss,"tp":order.takeProfit,"deviation":MAX_DEVIATION,"magic":MAGIC,"comment":f"GB:{order.id}"[:31],"type_time":mt5.ORDER_TIME_GTC,"type_filling":filling}

def checked_request(order:Order):
    for filling in (mt5.ORDER_FILLING_FOK,mt5.ORDER_FILLING_IOC,mt5.ORDER_FILLING_RETURN):
        req=request_for(order,filling); result=mt5.order_check(req)
        if result is not None and result.retcode==0: return req,result
    reason="order_check failed" if result is None else result.comment
    raise HTTPException(422,reason)

@asynccontextmanager
async def lifespan(_:FastAPI):
    if not mt5.initialize(): raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
    account()
    yield
    mt5.shutdown(); DB.close()

app=FastAPI(title="GreenBrain MT5 Demo Bridge",version="0.1.0",lifespan=lifespan,dependencies=[Depends(auth)])

@app.get("/v1/status")
def status(): account(); return {"status":"ready","environment":"demo","timestampMs":int(time.time()*1000)}
@app.get("/v1/heartbeat")
def heartbeat(): account(); return {"timestampMs":int(time.time()*1000)}
@app.get("/v1/account")
def get_account():
    x=account(); return {"login":int(x.login),"server":x.server,"broker":x.company,"tradeMode":"demo","balance":x.balance,"equity":x.equity,"currency":x.currency}
@app.get("/v1/ticks/{symbol}")
def tick(symbol:str):
    symbol_info(symbol); x=mt5.symbol_info_tick(symbol)
    if x is None or x.bid<=0 or x.ask<=x.bid: raise HTTPException(503,"Invalid quote")
    return {"symbol":symbol,"bid":x.bid,"ask":x.ask,"timestampMs":int(x.time_msc)}
@app.post("/v1/orders/check")
def order_check(order:Order):
    _,result=checked_request(order); return {"accepted":True,"reason":result.comment or "ok"}
@app.post("/v1/orders/send")
def order_send(order:Order):
    account()
    if DB.execute("SELECT 1 FROM submitted_orders WHERE id=?",(order.id,)).fetchone():
        return {"accepted":False,"timestampMs":int(time.time()*1000),"reason":"Duplicate order blocked"}
    req,_=checked_request(order); result=mt5.order_send(req); now=int(time.time()*1000)
    accepted=result is not None and result.retcode in (mt5.TRADE_RETCODE_DONE,mt5.TRADE_RETCODE_DONE_PARTIAL)
    if not accepted: return {"accepted":False,"timestampMs":now,"reason":"order_send failed" if result is None else result.comment}
    DB.execute("INSERT INTO submitted_orders(id,ticket,created_ms) VALUES(?,?,?)",(order.id,int(result.order or result.deal),now)); DB.commit()
    return {"accepted":True,"ticket":int(result.order or result.deal),"filledPrice":float(result.price),"filledUnits":float(result.volume)*100000,"timestampMs":now,"reason":result.comment or "filled"}
