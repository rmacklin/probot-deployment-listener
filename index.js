const bodyParser = require('body-parser');
const fetch = require('node-fetch');

module.exports = (robot) => {
  const app = robot.route('/deployment_listener');

  app.use(bodyParser.json());

  app.get('/ping', (req, res) => {
    res.end('pong');
  });

  app.post('/update_deployment_status', async (req, res) => {
    const { appInstallationId, deployment, deploymentStatus, logsPort, subdomain } = req.body;
    const deploymentLogURL = `http://ec2-18-219-211-124.us-east-2.compute.amazonaws.com:${logsPort}`;

    const { deploymentEnvironmentURL, description } =
      deploymentStatus === 'success' ?
        { deploymentEnvironmentURL: `https://${subdomain}.whosecase.com`,
          description: `Review App Deployer successfully deployed ${subdomain}` } :
        { deploymentEnvironmentURL: null,
          description: `Review App Deployer received request to deploy ${subdomain}` };

    const octokit = await robot.auth(appInstallationId);

    const createDeploymentStatusPayload = {
      owner: deployment.owner,
      repo: deployment.repo,
      id: deployment.id,
      state: deploymentStatus,
      description: description,
      log_url: deploymentLogURL,
      environment_url: deploymentEnvironmentURL,
      auto_inactive: true,
      headers: {
        accept: 'application/vnd.github.ant-man-preview+json'
      }
    };

    const result = await octokit.repos.createDeploymentStatus(createDeploymentStatusPayload);

    res.json(result.data);
  });

  robot.on(
    'deployment',
    async context => {
      const octokit = context.github;
      const payload = context.payload;
      const logUrl = 'http://ec2-18-219-211-124.us-east-2.compute.amazonaws.com:32770/';

      const makeShardPayload = {
        appInstallationId: payload.installation.id,
        callbackUrl: 'http://localhost:3000/deployment_listener/update_deployment_status',
        deployment: {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          id: payload.deployment.id
        },
        sha: payload.deployment.sha,
        subdomain: payload.deployment.environment
      }

      robot.log("The request we'll make to the deployer:");
      // fetch(
      //   'http://localhost:4000/shard',
      //   {
      //     method: 'POST',
      //     body: JSON.stringify(makeShardPayload),
      //     headers: {
      //       'Content-Type': 'application/json'
      //     }
      //   }
      // )
      robot.log(
        `
      fetch(
        'http://localhost:4000/shard',
        {
          method: 'POST',
          body: JSON.stringify(${JSON.stringify(makeShardPayload)}),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
        `
      );

      robot.log('Example callback request:');
      robot.log(
        `
        fetch(
          'http://localhost:3000/deployment_listener/update_deployment_status',
          {
            method: 'POST',
            body: JSON.stringify({
              appInstallationId: ${payload.installation.id},
              deployment: ${JSON.stringify(makeShardPayload.deployment)},
              deploymentStatus: 'pending',
              logsPort: 327701,
              subdomain: '${payload.deployment.environment}'
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
        `
      );
    }
  )
};
