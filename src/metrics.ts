import { Registry, Gauge } from 'prom-client';
import express = require('express');
import { makeRequest, IPrometheusClient, ICreateMetrics } from './helpers';
import * as http from 'http';

export function createPrometheusClient(node: string): IPrometheusClient {
  const register = new Registry();
  return {
    createMetrics: createMetrics(register, node),
    serveMetrics(req: express.Request, res: express.Response): void {
      res.setHeader('Content-Type', register.contentType);
      res.end(register.metrics());
    }
  };
}

function createMetrics(registry: Registry, nodeURL: string): ICreateMetrics {
  const createGauge = (name: string, help: string, labelNames: string[]) =>
    new Gauge({ name, help, labelNames, registers: [registry] });

  const gauges = {
    version: createGauge('parity_version', 'Client version', ['value']),
    connectedPeers: createGauge(
      'parity_connected_peers',
      'Connected Peers',
      []
    ),
    activePeers: createGauge('parity_active_peers', 'Active Peers', []),
    maxPeers: createGauge('parity_max_peers', 'Maximum Peers', []),
    syncStatus: createGauge(
      'parity_sync_status',
      'Blocks behind the latest block of the network',
      []
    ),
    currentBlock: createGauge(
      'parity_current_block',
      'Current Block of Parity Node',
      []
    ),
    parityUp: createGauge('parity_up', 'Parity up/down', []),
    enodeAddress: createGauge(
      'parity_enode_address',
      'Ethereum Node Address (enode URL)',
      []
    ), 
  };

  return async () => {
    try {
      const [
        clientVersion,
        syncInfo,
        latestBlockNumber,
        peersInfo
      ] = await Promise.all([
        makeRequest(nodeURL, 'web3_clientVersion'),
        makeRequest(nodeURL, 'eth_syncing'),
        makeRequest(nodeURL, 'eth_blockNumber'),
        makeRequest(nodeURL, 'parity_enode') 
      ]);

      if (clientVersion === false) {
        gauges.parityUp.set(0);
        return;
      }

      gauges.parityUp.set(1);
      gauges.version.set({ value: clientVersion }, 1);

      if (syncInfo !== false) {
        const current = parseInt(syncInfo.currentBlock, 16);
        const highest = parseInt(syncInfo.highestBlock, 16);
        gauges.syncStatus.set(highest - current);
      } else {
        gauges.syncStatus.set(0);
      }

      gauges.currentBlock.set(parseInt(latestBlockNumber, 16));
      gauges.activePeers.set(peersInfo.active);
      gauges.connectedPeers.set(peersInfo.connected);
      gauges.maxPeers.set(peersInfo.max);

      if (peersInfo.enode) {
        const enodeURL = peersInfo.enode;
        gauges.enodeAddress.set({ value: enodeURL }, 1);
      }
    } catch (error) {
      console.error('Failed to fetch node info:', error);
    }
  };
}
