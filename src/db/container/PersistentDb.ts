import { Db, MongoClient } from "mongodb";
import { Mongo, SPLIT_IN_ONE_DB } from "../../Config";
import { IDb } from "./IDb";
import { Logger } from "../../util/Logger";
import { LOG_MESSAGES } from "../../LogMessages";

export class PersistentDb implements IDb {
  private static connection: MongoClient;
  private db: Db;
  private database: string;
  private subsetName: string;
  private collection: string;
  private indexMap: { [name: string]: { index: object, property?: object } };

  static convertQuery(query: any): object {
    for (const key of Object.keys(query)) {
      if (key === "$not" && query.$not.$regex) {
        query.$not = new RegExp(query.$not.$regex, query.$not.$options);
      } else if (query[key] instanceof Object) {
        query[key] = PersistentDb.convertQuery(query[key]);
      }
    }
    return query;
  }

  private static async getConnection() {
    if (!PersistentDb.connection) {
      PersistentDb.connection = await MongoClient.connect(Mongo.getUrl(), Mongo.getOption())
    }
    return PersistentDb.connection;
  }

  private static errorExit(error: any, num: number): any {
    const logger = Logger.getLoggerWoDB("PersistentDb");
    logger.error(LOG_MESSAGES.ERROR_MSG, [error.toString()], [num]);
    process.exit(1);
  }

  public static getAllStorage(): Promise<string[]> {
    if (Mongo.isOneDb()) {
      return PersistentDb.getConnection()
        .then((client) => client.db(Mongo.getDbName("")).listCollections())
        .then((result) => result.toArray())
        .then((list) => {
          const set = new Set();
          for (const row of list) {
            set.add(row.name.split(SPLIT_IN_ONE_DB)[0]);
          }
          return Array.from(set);
        })
        .catch((error) => PersistentDb.errorExit(error, 1));
    } else {
      return PersistentDb.getConnection()
        .then((client) => client.db().admin().listDatabases())
        .then((list) => list.databases.map((_: { name: string; }) => _.name))
        .catch((error) => PersistentDb.errorExit(error, 1));
    }
  }

  public static deleteStorage(name: string) {
    if (Mongo.isOneDb()) {
      return (async () => {
        try {
          const client = await PersistentDb.getConnection();
          const result = await client.db(Mongo.getDbName("")).listCollections();
          const list = await result.toArray();
          for (const row of list) {
            if (row.name.split(SPLIT_IN_ONE_DB)[0] === name) {
              await client.db(Mongo.getDbName("")).dropCollection(row.name);
            }
          }
        } catch (error) {
          PersistentDb.errorExit(error, 2);
        }
      })();
    } else {
      return PersistentDb.getConnection()
        .then((client) => client.db(name).dropDatabase())
        .catch((error) => PersistentDb.errorExit(error, 2));
    }
  }

  constructor(database: string) {
    this.subsetName = database;
    this.database = Mongo.getDbName(database)
    console.log("PersistentDb is created");
  }

  setCollection(collection: string) {
    this.collection = Mongo.getCollectionName(this.subsetName, collection);
  }

  setIndexes(indexMap: { [name: string]: { index: object, property?: object } }): void {
    this.indexMap = indexMap;
  }

  start(): Promise<void> {
    return PersistentDb.getConnection()
      .then((client) => {
        this.db = client.db(this.database);
        return this.createIndexes();
      })
      .catch((error) => PersistentDb.errorExit(error, 3));
  }

  findOne(query: object): Promise<object | null> {
    return this.db.collection(this.collection).findOne(PersistentDb.convertQuery(query))
      .catch((error) => PersistentDb.errorExit(error, 4));
  }

  findByRange(field: string, from: any, to: any, dir: number, projection?: object): Promise<any[]> {
    return this.find({ $and: [{ [field]: { $gte: from } }, { [field]: { $lte: to } }] }, { [field]: dir }, undefined, undefined, projection)
      .catch((error) => PersistentDb.errorExit(error, 5));
  }

  findOneBySort(query: object, sort: object): Promise<any> {
    return this.db.collection(this.collection).find(PersistentDb.convertQuery(query)).sort(sort).limit(1).next()
      .catch((error) => PersistentDb.errorExit(error, 6));
  }

  find(query: object, sort?: object, limit?: number, offset?: number, projection?: object): Promise<any[]> {
    let cursor = this.db.collection(this.collection).find(PersistentDb.convertQuery(query), { projection })
    if (sort) { cursor = cursor.sort(sort); }
    if (offset) { cursor = cursor.skip(offset); }
    if (limit) { cursor = cursor.limit(limit); }
    return cursor.toArray()
      .catch((error) => PersistentDb.errorExit(error, 7));
  }

  count(query: object): Promise<number> {
    return this.db.collection(this.collection).countDocuments(PersistentDb.convertQuery(query))
      .catch((error) => PersistentDb.errorExit(error, 8));
  }

  insertOne(doc: object): Promise<void> {
    return this.db.collection(this.collection).insertOne(doc).then(() => { })
      .catch((error) => PersistentDb.errorExit(error, 9));
  }

  insertMany(docs: object[]): Promise<void> {
    return this.db.collection(this.collection).insertMany(docs).then(() => { })
      .catch((error) => PersistentDb.errorExit(error, 10));
  }

  increment(id: string, field: string): Promise<number> {
    return this.db.collection(this.collection)
      .findOneAndUpdate({ _id: id }, { $inc: { [field]: 1 } }, { returnOriginal: false })
      .then((result) => {
        if (result.ok) {
          return result.value[field];
        } else {
          return Promise.reject(result.lastErrorObject.toString());
        }
      })
      .catch((error) => PersistentDb.errorExit(error, 11));
  }

  updateOneById(id: string, update: object): Promise<void> {
    return this.db.collection(this.collection).updateOne({ _id: id }, update)
      .then((result) => {
        if (!result.result.ok || result.result.n !== 1) { throw new Error("failed to update: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 12));
  }

  updateOne(filter: object, update: object): Promise<void> {
    return this.db.collection(this.collection).updateOne(filter, update)
      .then((result) => {
        if (!result.result.ok || result.result.n !== 1) { throw new Error("failed to update: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 13));
  }

  replaceOneById(id: string, doc: object): Promise<void> {
    (doc as any)._id = id;
    return this.db.collection(this.collection).replaceOne({ _id: id }, doc, { upsert: true })
      .then((result) => {
        if (!result.result.ok || result.result.n !== 1) { throw new Error("failed to replace: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 14));
  }

  deleteOneById(id: string): Promise<void> {
    return this.db.collection(this.collection).deleteOne({ _id: id })
      .then((result) => {
        if (!result.result.ok) { throw new Error("failed to delete: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 15));
  }

  deleteByRange(field: string, from: any, to: any): Promise<void> {
    const query = { $and: [{ [field]: { $gte: from } }, { [field]: { $lte: to } }] };
    return this.db.collection(this.collection).deleteMany(PersistentDb.convertQuery(query))
      .then((result) => {
        if (!result.result.ok) { throw new Error("failed to delete: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 16));
  }

  deleteAll(): Promise<void> {
    return this.db.collection(this.collection).deleteMany({})
      .then((result) => {
        if (!result.result.ok) { throw new Error("failed to delete: " + JSON.stringify(result)); }
      })
      .catch((error) => PersistentDb.errorExit(error, 17));
  }

  private createIndexes(): Promise<void> {
    if (!this.indexMap) { return Promise.resolve(); }
    const indexMap = this.indexMap;
    const indexNameList: { [name: string]: any } = {};
    return this.db.collections()
      .then((collections) => {
        for (const collection of collections) {
          if (collection.collectionName === this.collection) {
            return collection;
          }
        }
        return this.db.createCollection(this.collection);
      })
      .then((collection) => collection.indexes())
      .then((indexes) => {
        // インデックスの削除
        const indexPromises: Promise<any>[] = [];
        for (const index of indexes) {
          if (index.name !== "_id_" && !indexMap[index.name]) {
            indexPromises.push(this.db.collection(this.collection).dropIndex(index.name));
          }
          indexNameList[index.name] = true;
        }
        return Promise.all(indexPromises);
      })
      .then(() => {
        // インデックスの追加
        const indexPromises: Promise<any>[] = [];
        for (const indexName in indexMap) {
          if (!indexNameList[indexName]) {
            const fields = indexMap[indexName].index;
            const options: { [key: string]: any } = indexMap[indexName].property ? { ...indexMap[indexName].property } : {};
            options.name = indexName;
            indexPromises.push(this.db.collection(this.collection).createIndex(fields, options));
          }
        }
        return Promise.all(indexPromises).then(() => { });
      })
      .catch((error) => PersistentDb.errorExit(error, 18));
  }
}
