const AWS = require('aws-sdk')
const dotenv = require('dotenv')

const body = process.argv[2]
const id = process.argv[3]

const parsed = body.replace(/\r/g, '').split('\n').filter((v) => v && !v.includes('#'))

const AMI = {
  'Ubuntu': 'ami-058165de3b7202099',
  'AmazonLinux': 'ami-01d87646ef267ccd7'
}

let instanceParams = {
  ImageId: AMI[parsed[5]],
  InstanceType: process.env.AWS_INSTACNE_TYPE,
  KeyName: id + '-key',
  MinCount: 1,
  MaxCount: 1,
  SecurityGroupIds: [],
  UserData: parsed[6]
}

let instanceId = ''

if (!parsed[7].includes('x')) {
  return console.log('::set-output name=approved::false')
} else console.log('::set-output name=approved::true')

if (!id) {
  return console.log('::set-output name=id_valid::false')
} else console.log('::set-output name=id_valid::true')

dotenv.config()
AWS.config.update({ accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: process.env.AWS_REGION })

const ec2 = new AWS.EC2({ region: 'ap-northeast-2' })

// Create key
ec2.createKeyPair({ KeyName: id + '-key' }, (err, data) => {
  if (err) return console.log('::set-output name=key_created::false')
  else console.log('::set-output name=key_created::true')
  console.log('::set-output name=key::' + data.KeyMaterial)
});

// Create security group
ec2.createSecurityGroup({ GroupName: id + '-sg', Description: 'Security group for ' + id, VpcId: process.env.AWS_VPC_ID }, (err, data) => {
  if (err) return console.log('::set-output name=sg_created::false')
  else console.log('::set-output name=sg_created::true')
  console.log('::set-output name=sg_id::' + data.GroupId)
  instanceParams.SecurityGroupIds = [data.GroupId]

  // Add rules to security group
  const ports = parsed[4].split(',').map((v) => parseInt(v))
  ec2.authorizeSecurityGroupIngress({ 
    GroupId: data.GroupId,
    IpPermissions: [
      { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
      ports.forEach((port) => ( port !== 22 && { IpProtocol: 'tcp', FromPort: port, ToPort: port, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }))
    ] 
  }, (err) => {
    if (err) return console.log('::set-output name=sg_rules_added::false')
    else console.log('::set-output name=sg_rules_added::true')
  })
})

// Create instance
ec2.runInstances(instanceParams).promise().then((data) => {
  console.log('::set-output name=instance_created::true')
  console.log('::set-output name=instance_id::' + data.Instances[0].InstanceId)
  console.log('::set-output name=instance_ip::' + data.Instances[0].PublicIpAddress)
  instanceId = data.Instances[0].InstanceId

  // Add tags to instance
  ec2.createTags({ Resources: [data.Instances[0].InstanceId], Tags: [{ Key: 'Name', Value: id }] }, (err) => {
    if (err) return console.log('::set-output name=instance_tagged::false')
    else console.log('::set-output name=instance_tagged::true')
  })
}).catch((err) => {
  console.log('::set-output name=instance_created::false')
})

// Create EIP
ec2.allocateAddress({ Domain: 'vpc' }, (err, data) => {
  if (err) return console.log('::set-output name=eip_created::false')
  else console.log('::set-output name=eip_created::true')
  console.log('::set-output name=eip::' + data.PublicIp)

  // Associate EIP to instance
  ec2.associateAddress({ InstanceId: instanceId, AllocationId: data.AllocationId }, (err) => {
    if (err) return console.log('::set-output name=eip_associated::false')
    else console.log('::set-output name=eip_associated::true')
  })
})
