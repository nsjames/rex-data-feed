import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import { google } from 'googleapis';
import { auth } from 'google-auth-library';
import fs from 'fs';
import {Int64, Asset} from "@wharfkit/antelope";

const client = auth.fromJSON(JSON.parse(fs.readFileSync('serviceaccount.json', 'utf8')));
client.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const sheets = google.sheets({ version: 'v4', auth: client });

// this is in the URL of the spreadsheet
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

if(!SPREADSHEET_ID) {
    throw new Error('No spreadsheet ID found in .env');
}

async function appendToSheet(range, values) {
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values
        }
    }).catch((err) => {
        console.error(err);
    });

    console.log(response);
}

const run = async () => {

    try {
        const pool = await fetch('https://eos.greymass.com/v1/chain/get_table_rows', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: 'eosio',
                scope: 'eosio',
                table: 'rexpool',
                json: true
            })
        }).then((res) => res.json()).then(x => x.rows[0])

        const retpool = await fetch('https://eos.greymass.com/v1/chain/get_table_rows', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: 'eosio',
                scope: 'eosio',
                table: 'rexretpool',
                json: true
            })
        }).then((res) => res.json()).then(x => x.rows[0])



        const rexPrice = (() => {
            const S0 = parseFloat(pool.total_lendable.split(' ')[0]);
            const R0 = parseFloat(pool.total_rex.split(' ')[0]);
            const R1 = R0 + 1;
            const S1 = (S0 * R1) / R0;
            return parseFloat(parseFloat((S1 - S0).toString()).toFixed(10));
        })();

        const apy = (() => {
            const total_lendable = Asset.fromString(pool.total_lendable).units.toNumber();
            const current_rate_of_increase = Int64.from(retpool.current_rate_of_increase).toNumber();
            const proceeds = Int64.from(retpool.proceeds).toNumber();
            return parseFloat(((proceeds + current_rate_of_increase) / 30 * 365) / total_lendable * 100).toFixed(2);
        })();

        // timestamp, apy, rex_price, total_staked
        await appendToSheet('REX-EOS-PRICE!A1', [[+new Date(), apy, rexPrice, pool.total_lendable.split(' ')[0]]]);
    } catch (err) {
        console.error(err);
    }
};

run();
setInterval(() => {
    run();
}, 1000 * 60 * 60);

// test
