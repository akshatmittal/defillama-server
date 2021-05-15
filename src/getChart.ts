import { successResponse, wrap, IResponse } from "./utils";
import protocols from "./protocols/data";
import dynamodb from "./utils/dynamodb";
import { getClosestDayStartTimestamp } from "./date/getClosestDayStartTimestamp";
import {normalizeChain} from './utils/normalizeChain'

const handler = async (
  event: AWSLambda.APIGatewayEvent
): Promise<IResponse> => {
  const chain = event.pathParameters?.chain?.toLowerCase();
  const sumDailyTvls = {} as {
    [timestamp: number]: number | undefined;
  };
  await Promise.all(
    protocols.map(async (protocol) => {
      if (protocol.name === "Stacks" || protocol.name === "Uniswap v3") {
        return;
      }
      if (chain !== undefined && protocol.chain.toLowerCase() !== chain) {
        return;
      }
      const historicalTvl = await dynamodb.query({
        ExpressionAttributeValues: {
          ":pk": `dailyTvl#${protocol.id}`,
        },
        KeyConditionExpression: "PK = :pk",
      });
      if (historicalTvl.Items !== undefined) {
        historicalTvl.Items.forEach((item) => {
          const timestamp = getClosestDayStartTimestamp(item.SK);
          const itemTvl = chain === undefined? item.tvl : item[normalizeChain(chain)] ?? item.tvl;
          sumDailyTvls[timestamp] = itemTvl + (sumDailyTvls[timestamp] ?? 0);
        });
      }
    })
  );
  let minTimestamp = 1603757978;
  if(chain !== undefined && chain !== "ethereum") {
    minTimestamp = 1612837719;
  }
  Object.keys(sumDailyTvls).forEach((timestamp) => {
    if (Number(timestamp) < minTimestamp) {
      delete sumDailyTvls[Number(timestamp)];
    }
  });

  const response = Object.entries(sumDailyTvls).map(([timestamp, tvl]) => ({
    date: timestamp,
    totalLiquidityUSD: tvl,
  }));
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
