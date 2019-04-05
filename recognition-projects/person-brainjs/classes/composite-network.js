import Network from "../classes/network.js";
import Logger from "../classes/logger.js";
import FrameProcessor from "../classes/frame-processor.js";
let logger = new Logger("CompositeNetwork");
let processTime;

class CompositeNetwork {
  constructor(networkArray = []) {
    this.networkArray = networkArray;
    this.trainee = false;
    this.processTime = 0;
  }
  export() {
    let results = [];
    this.networkArray.forEach(network => {
      results.push(network.net.toJSON());
    });
    console.log('Exported network', results);
    return results;
  }
  import(networkArray) {
    networkArray.forEach(net => {
      this.networkArray.push(new Network(null, net));
    });
    console.log('Imported network', this.networkArray);
  }
  addOutputScale(dims){
    if (this.frameProcessor) {
      this.frameProcessor.addScale(dims);
    } else {
      this.frameProcessor = new FrameProcessor(dims);
    }
  }
  processFrame(image, dims) {
    if (this.frameProcessor) {
      return this.frameProcessor.process(image, dims);
    } else {
      throw 'Attempted to process frame before adding output scales!';
    }
  }
  run(input) {
    let result = 0;
    this.processTime = 0;
    this.networkArray.forEach(network => {
      if (result === 0) {
        result = Math.round(network.run(input)[0]);
        //console.log("network.processTime", network.processTime);
        this.processTime += network.processTime;
      }
    });
    return result;
  }
  testRun(input) {
    if (!this.trainee) {
      return this.run(input);
    }
    let result = 0;
    let testNetArray = this.networkArray.slice();
    testNetArray.push(this.trainee);
    testNetArray.forEach(network => {
      if (result === 0) {
        result = Math.round(network.run(input)[0]);
      }
    });
    return result;
  }
  setTrainee(net) {
    this.trainee = net;
  }
  generateWorkers() {
    this.workers = [];
    for (let i = 0; i < this.threads; i++) {
      this.workers.push(new Worker("./workers/main.js"));
      this.workers[i].postMessage({
        operation: "load-network-array",
        networkArray: this.export()
      });
    }
    console.log("Generated workers on ", this.threads, "threads.");
  }
  confirmTrainee() {
    this.networkArray.push(this.trainee);
    delete this.trainee;
  }
  train(dataSet, config, callback) {
    let data = [];
    dataSet.t.forEach(input => {
      data.push([input, [1]]);
    });
    dataSet.f.forEach(input => {
      data.push([input, [0]]);
    });
    let trainee = this.trainee;
    let relevantData = [];
    let skips = 0;
    let learns = 0;
    data.forEach(item => {
      let input = item[0];
      let expected = item[1][0];

      if (this.networkArray.length > 0) {
        let result = this.run(input);
        if (result === 0 || expected === 0) {
          logger.log(
            "Training trainee against any negative results, regardless of previous layer success."
          );
          relevantData.push(item);
        } else if (result !== expected) {
          logger.log(
            "Network failed to output expected [",
            expected,
            "], instead output was [",
            result,
            "], training trainee layer against this data."
          );
          relevantData.push(item);
          learns++;
        } else {
          logger.log(
            "Network already outputs [",
            expected,
            "], as expected [",
            result,
            "], not training trainee against this data."
          );
          skips++;
        }
      } else {
        logger.log(
          "Network is the first layer of the CompositeNetwork, training trainee layer against this (all) data."
        );
        relevantData.push(item);
      }
    });
    if (skips > 0) {
      logger.log(
        "Previous layers allow this layer to train for recognition of",
        skips,
        "fewer positive profiles, creating the opportunity for specialization toward the remaining",
        dataSet.t.length - skips,
        "positive profiles that the previous layer failed to recognize."
      );
    }
    this.trainee.train(relevantData, config, callback);
  }
}

export default CompositeNetwork;
